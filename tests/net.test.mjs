// 対人戦の通信の手順のテスト（メモリの中で2つの端をつなぐ。実際のネットワークは使わない）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { memoryPair } from '../js/net/transport.js';
import { createSession, NetError, RULES, isValidRule, ruleLabel } from '../js/net/session.js';
import { Rng } from '../js/core/rng.js';
import { analyze } from '../js/core/jan.js';
import { startSeries, resolveSeriesTurn } from '../js/core/series.js';

const data = { monsters: JSON.parse(fs.readFileSync('data/monsters.json')).monsters, skills: JSON.parse(fs.readFileSync('data/skills.json')).skills };
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  ' + name); };
const pair = (o = {}) => { const p = memoryPair(); const H = createSession(p.a, { host: true, version: 5, ...o }), G = createSession(p.b, { host: false, version: 5, ...o }); return { p, H, G }; };
const rej = async (promise, code) => { try { await promise; } catch (e) { assert.equal(e.code, code, `期待 ${code} / 実際 ${e.code}`); return; } assert.fail(`${code} で失敗するはず`); };

await t('ルール：6つ（1v1・2v2・3v3）', () => {
  assert.equal(RULES.length, 6);
  assert(isValidRule({ bring: 3, fight: 2 })); assert(!isValidRule({ bring: 4, fight: 2 })); assert(!isValidRule(null));
  assert(isValidRule({ bring: 3, fight: 3, summon: 'live' })); assert(isValidRule({ bring: 3, fight: 3, summon: 'stock' })); assert(!isValidRule({ bring: 3, fight: 3, summon: 'x' }));
  assert.equal(ruleLabel({ bring: 3, fight: 2, summon: 'live' }), '2対2（3体持ち込み）・ライブスキャン');
});

await t('あいさつ：同じ版なら、ルールが部屋を作った側から届く', async () => {
  const { p, H, G } = pair(); p.connect();
  const [r1, r2] = await Promise.all([H.handshake({ bring: 3, fight: 2 }), G.handshake()]);
  assert.deepEqual(r1, { bring: 3, fight: 2 }); assert.deepEqual(r2, { bring: 3, fight: 2 });
});

await t('あいさつ：データの版が違うと、両方が「version」で止まる', async () => {
  const p = memoryPair(); const H = createSession(p.a, { host: true, version: 5 }), G = createSession(p.b, { host: false, version: 4 }); p.connect();
  await Promise.all([rej(H.handshake({ bring: 1, fight: 1 }), 'version'), rej(G.handshake(), 'version')]);
});

await t('あいさつ：参加が、部屋を作るより先でも、後でも、つながる（送ったものを、つながったときに送る）', async () => {
  const { p, H, G } = pair();
  const hp = H.handshake({ bring: 1, fight: 1 }); const gp = G.handshake();   // まだ誰もいない
  await new Promise(r => setTimeout(r, 50)); p.connect();
  const [r] = await Promise.all([hp, gp]); assert.deepEqual(r, { bring: 1, fight: 1 });
});

await t('同時に確定：お互いの値が届く（どちらが先でも）', async () => {
  const { p, H, G } = pair(); p.connect();
  const [x, y] = await Promise.all([H.exchange('pool', ['111', '222']), G.exchange('pool', ['333'])]);
  assert.deepEqual(x, ['333']); assert.deepEqual(y, ['111', '222']);
  const [x2, y2] = await Promise.all([G.exchange('party', [2, 0]), (async () => { await new Promise(r => setTimeout(r, 30)); return H.exchange('party', [1]); })()]);
  assert.deepEqual(x2, [1]); assert.deepEqual(y2, [2, 0]);
});

await t('同時に確定：null（動けないとき）も渡せる', async () => {
  const { p, H, G } = pair(); p.connect();
  const [x, y] = await Promise.all([H.turn(1, null), G.turn(1, 2)]); assert.equal(x, 2); assert.equal(y, null);
});

await t('ずる：公開する中身を書き換えると「cheat」で見つかる', async () => {
  const { p, H, G } = pair(); p.connect();
  const orig = p.b.send; p.b.send = obj => { if (obj.k.startsWith('r:')) obj = { ...obj, v: { ...obj.v, json: '[0]' } }; orig(obj); };   // ゲスト側の通信を、書き換える
  await rej(Promise.all([H.exchange('party', [1]), G.exchange('party', [2])]), 'cheat');
});

await t('ずる：先に見せたものは、あとから変えられない（金庫のハッシュと合わない）', async () => {
  const { p, H, G } = pair(); p.connect();
  const orig = p.b.send; let sent = false;
  p.b.send = obj => { if (obj.k.startsWith('c:') && !sent) { sent = true; obj = { ...obj, v: 'ffff' }; } orig(obj); };   // 金庫のハッシュを、でたらめにする
  await rej(Promise.all([H.exchange('t1', 0), G.exchange('t1', 1)]), 'cheat');
});

await t('切断：待つ間に戻れば、続けられる（送ったものを、全部送り直す）', async () => {
  const { p, H, G } = pair({ graceMs: 2000 }); p.connect();
  const ex = Promise.all([H.exchange('t1', 0), (async () => { await new Promise(r => setTimeout(r, 120)); return G.exchange('t1', 1); })()]);
  await new Promise(r => setTimeout(r, 30)); p.drop();            // ホストが先に金庫を出したあと、切れる
  await new Promise(r => setTimeout(r, 300)); p.connect();         // 少しして、戻る
  const [x, y] = await ex; assert.equal(x, 1); assert.equal(y, 0);
});

await t('切断：戻らなければ、猶予のあとで「lost」', async () => {
  const { p, H, G } = pair({ graceMs: 300 }); p.connect(); p.drop();
  await rej(H.exchange('t1', 0), 'lost');
});

await t('切断：相手がいるのに返事がないと「timeout」', async () => {
  const { p, H } = pair({ turnWaitMs: 300 }); p.connect();
  await rej(H.exchange('t1', 0), 'timeout');
});

await t('ギブアップ：相手の待ちが「bye」で終わる', async () => {
  const { p, H, G } = pair(); p.connect();
  const w = rej(H.exchange('t1', 0), 'bye'); await new Promise(r => setTimeout(r, 30)); await G.bye('forfeit'); await w;
});

await t('アプリを開き直した相手は「restart」', async () => {
  const p = memoryPair(); const H = createSession(p.a, { host: true, version: 5 }); p.connect();
  const G1 = createSession(p.b, { host: false, version: 5 }); G1.handshake().catch(() => {});
  await H.handshake({ bring: 1, fight: 1 });
  const w = rej(H.exchange('t1', 0), 'restart');
  const G2 = createSession(p.b, { host: false, version: 5 }); G2.handshake().catch(() => {});   // 同じ端に、別の（新しい）あいさつ
  p.connect(); await w;
});

await t('乱数と計算：両方の端で、同じ文字から同じ結果になる（ホスト＝a、ゲスト＝b）', async () => {
  const { p, H, G } = pair(); p.connect();
  const [sh, sg] = await Promise.all([H.seed(), G.seed()]); assert.equal(sh, sg);
  const jans = ['4901234567894', '4500000000018', '2701013043692', '9339835287081', '6354601642041', '6903855304214'];
  const run = () => {
    const A = jans.slice(0, 3).map(j => analyze(j, data)), B = jans.slice(3).map(j => analyze(j, data));
    const s = startSeries(A, B), rng = new Rng(sh), log = [];
    while (!s.over && log.length < 200) log.push(...resolveSeriesTurn(s, 0, 0, rng));
    return JSON.stringify([s.result, log]);
  };
  assert.equal(run(), run());
});

await t('部屋に、3人目は入れない（送るのも、受けるのも、最初の相手だけ）', async () => {
  const h = {}, sent = [];
  const tr = { selfId: 'H', send: (o, to) => sent.push(to), onMessage: f => { h.msg = f; }, onPeerJoin: f => { h.join = f; }, onPeerLeave: f => { h.leave = f; }, peers: () => [], leave() {} };
  const H = createSession(tr, { host: true, version: 5 });
  H.handshake({ bring: 1, fight: 1 }).catch(() => {});
  h.join('B'); h.join('C');                                                     // Cは、あとから来た3人目
  assert(sent.length > 0 && sent.every(to => to === 'B'), 'Bにだけ送る');
  h.msg({ k: 'hello:b', v: { proto: 1, version: 5 }, sid: 'x' }, 'C');         // 3人目からの、なりすまし
  await rej(H.waitFor('hello:b', { timeoutMs: 250 }), 'timeout');              // 届いていない
  h.msg({ k: 'hello:b', v: { proto: 1, version: 5 }, sid: 'y' }, 'B');         // 最初の相手からは届く
  assert.deepEqual(await H.waitFor('hello:b', { timeoutMs: 250 }), { proto: 1, version: 5 });
});

console.log(`\n${n} tests passed`);
process.exit(0);   // 待機中のタイマーが残るので、ここで終える
