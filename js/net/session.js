// 対人戦の通信の手順（transport の上で動く）。画面には依存しない（テストできる）。
// ねらい：
//  ・選出も、技の選択も、「先に金庫に入れる（ハッシュだけ送る）→ 両方そろったら鍵を開ける（中身を公開）」の順で行う
//    → 相手の選択を見てから、自分の選択を変えることができない（commit-reveal）
//  ・送ったものは、すべて控えておき、相手がつなぎ直したときに、全部送り直す → 回線が一時的に切れても、続けられる
//  ・両者が同じ番号の乱数で、同じ計算をする（結果が一致する）
import { hashSeed } from '../core/rng.js';

export const PROTO = 1;
// 対人戦の6つのルール（持ち込み／戦う体数）
export const RULES = [
  { bring: 1, fight: 1 }, { bring: 3, fight: 1 },
  { bring: 2, fight: 2 }, { bring: 3, fight: 2 },
  { bring: 3, fight: 3 }, { bring: 5, fight: 3 },
];
export const ruleLabel = r => `${r.fight}対${r.fight}（${r.bring}体持ち込み）`;
export const isValidRule = r => !!r && RULES.some(x => x.bring === r.bring && x.fight === r.fight);

export class NetError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
export const randHex = n => hex(globalThis.crypto.getRandomValues(new Uint8Array(n)));
export async function sha256hex(text) {
  const sub = globalThis.crypto && globalThis.crypto.subtle;
  if (!sub) return 'w' + hashSeed(text).toString(16);   // httpsでない環境の代わり（弱い。本番はhttpsなので使われない）
  return hex(new Uint8Array(await sub.digest('SHA-256', new TextEncoder().encode(text))));
}

// opts: { host, version, graceMs（切れてから待つ時間。既定30秒）, turnWaitMs（相手の返事を待つ時間。既定60秒） }
export function createSession(transport, { host, version, graceMs = 30000, turnWaitMs = 60000 }) {
  const me = host ? 'a' : 'b', opp = host ? 'b' : 'a';
  const sid = randHex(6);
  const inbox = new Map(), outbox = new Map();
  let peerId = null, present = false, lostAt = 0, closed = false, round = 0, oppSid = null, fatal = null;
  const listeners = new Set();
  const state = () => ({ present, lostFor: present || !lostAt ? 0 : Date.now() - lostAt, closed });
  const emit = () => { for (const f of [...listeners]) f(state()); };

  const sendRaw = (k, v) => { if (present && peerId && !closed) transport.send({ k, v, sid }, peerId); };
  const put = (k, v) => { outbox.set(k, v); sendRaw(k, v); };

  transport.onMessage((d, from) => {
    if (closed || !d || typeof d.k !== 'string') return;
    if (peerId && from !== peerId) return;                 // 3人目は無視する
    if (d.k === `hello:${opp}`) {
      if (oppSid && d.sid !== oppSid) { fatal = new NetError('restart'); emit(); return; }   // 相手が、アプリを開き直した
      oppSid = d.sid;
    } else if (oppSid && d.sid !== oppSid) return;
    inbox.set(d.k, d.v);
    emit();
  });
  transport.onPeerJoin(id => {
    if (closed || (present && id !== peerId)) return;      // すでに相手がいるときは、ほかの人を入れない
    peerId = id; present = true; lostAt = 0;
    for (const [k, v] of outbox) sendRaw(k, v);            // これまで送ったものを、全部送り直す
    emit();
  });
  transport.onPeerLeave(id => {
    if (id !== peerId || !present) return;
    present = false; lostAt = Date.now(); emit();
  });

  // 相手からの key を待つ。timeoutMs：相手がいるのに返事がない時間／切れてから戻らない時間は graceMs
  function waitFor(key, { timeoutMs = turnWaitMs } = {}) {
    return new Promise((resolve, reject) => {
      let last = Date.now(), active = 0, done = false, timer = null;
      const fin = (err, val) => { if (done) return; done = true; clearInterval(timer); listeners.delete(tick); err ? reject(err) : resolve(val); };
      function tick() {
        if (done) return;
        if (closed) return fin(new NetError('closed'));
        const b = inbox.get('bye:' + opp);
        if (b !== undefined) return fin(new NetError('bye', b));
        if (fatal) return fin(fatal);
        if (inbox.has(key)) return fin(null, inbox.get(key));
        const now = Date.now(), dt = now - last; last = now;
        if (!present) { if (lostAt && now - lostAt > graceMs) fin(new NetError('lost')); }
        else if ((active += dt) > timeoutMs) fin(new NetError('timeout'));
      }
      listeners.add(tick); timer = setInterval(tick, 100); tick();
    });
  }

  // 同時に確定する（commit-reveal）。戻り値＝相手の値
  async function exchange(tag, value, o = {}) {
    const t = `${round}.${tag}`, salt = randHex(12), json = JSON.stringify(value);
    put(`c:${t}:${me}`, await sha256hex(`${t}|${salt}|${json}`));
    const oc = await waitFor(`c:${t}:${opp}`, o);
    put(`r:${t}:${me}`, { salt, json });                    // 相手の「金庫」が届いてから、中身を公開する
    const or = await waitFor(`r:${t}:${opp}`, o);
    if (!or || typeof or.json !== 'string' || (await sha256hex(`${t}|${or.salt}|${or.json}`)) !== oc) throw new NetError('cheat', tag);
    return JSON.parse(or.json);
  }

  return {
    me, opp, host, get round() { return round; },
    state, onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    waitFor,
    // 最初のあいさつ：アプリとデータの版が同じか確かめる。ルールは、部屋を作った側が決める
    async handshake(rule, o = {}) {
      put(`hello:${me}`, { proto: PROTO, version, app: 'barcode-summoner' });
      const hi = await waitFor(`hello:${opp}`, { timeoutMs: Infinity, ...o });
      if (!hi || hi.proto !== PROTO || hi.version !== version) throw new NetError('version', hi);
      if (host) { put('rule', rule); return rule; }
      const r = await waitFor('rule', { timeoutMs: 60000 });
      if (!isValidRule(r)) throw new NetError('cheat', 'rule');
      return r;
    },
    exchange,
    oppBye: () => inbox.get('bye:' + opp),   // 相手がやめたとき、その理由（'forfeit' など）。まだなら undefined
    hasOppCommit: tag => inbox.has(`c:${round}.${tag}:${opp}`),
    // 乱数のもと：両者の文字を、部屋を作った側（a）→参加した側（b）の順に並べる（同じ文字列になる）
    async seed() { const mine = randHex(8), theirs = await exchange('seed', mine); return host ? `${mine}:${theirs}` : `${theirs}:${mine}`; },
    // 技の選択：step＝試合の中で何回目か。slot＝0〜2、または動けないときは null
    turn: (step, slot) => exchange('t' + step, slot, { timeoutMs: turnWaitMs }),
    // 再戦：両者が押すと、次のラウンドへ
    async rematch(o = {}) { put(`rm:${round}:${me}`, 1); await waitFor(`rm:${round}:${opp}`, { timeoutMs: 120000, ...o }); round++; },
    async bye(reason = 'leave') { put('bye:' + me, reason); await new Promise(r => setTimeout(r, 200)); this.close(); },
    close() { if (closed) return; closed = true; emit(); try { transport.leave(); } catch (e) { /* 何もしない */ } },
  };
}
