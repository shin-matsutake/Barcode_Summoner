// 対人戦（オンライン）：pvpLobby＝部屋を作る／入る、pvpSelect＝持ち込み→出撃メンバー（それぞれ、相手と同時に確定）
import { h, today } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { statsGrid, skillList } from './monsterInfo.js';
import { openRoom, netKind } from '../net/transport.js';
import { createSession, ruleLabel } from '../net/session.js';
import { formationPanel, summonPanel } from './ruleui.js';

export const endPvp = ctx => { if (ctx.pvp) { try { ctx.pvp.session.close(); } catch (e) { /* 何もしない */ } ctx.pvp = null; } };

const errText = e => {
  const c = e && e.code;
  if (c === 'bye') return e.detail === 'forfeit' ? '相手がギブアップしました。' : '相手が、対戦をやめました。';
  if (c === 'lost') return '相手との接続が切れたまま、戻りませんでした。';
  if (c === 'timeout') return '相手の返事が、ありませんでした。';
  if (c === 'cheat') return '通信に、おかしなところがありました。対戦を終わります。';
  if (c === 'restart') return '相手がアプリを開き直したので、対戦を終わります。';
  return '通信でエラーが起きました。';
};
const bar = (title, onBack, sub) => {
  const b = h('header', 'bar'), back = h('button', 'btn small', '戻る'); back.onclick = onBack;
  if (sub) { const t = h('div'); t.append(h('h1', '', title), h('div', 'sub', sub)); b.append(back, t); } else b.append(back, h('h1', '', title));
  return b;
};
const randomCode = () => String(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

// ---- ゲート（部屋）：ゲートを開く／ゲートに入る ----
export function pvpLobby(root, ctx) {
  endPvp(ctx);
  let mode = 'menu', code = '', session = null, cancelled = false, hintTimer = 0;
  const rule = { bring: 3, fight: 3, summon: 'stock' };
  const wrap = h('div', 'page'); root.append(wrap);
  const cleanup = () => { cancelled = true; clearTimeout(hintTimer); if (session && !ctx.pvp) { session.close(); session = null; } };

  async function connect(host) {
    mode = 'wait'; cancelled = false; draw();
    const status = wrap.querySelector('.pvp-status'), hint = wrap.querySelector('.pvp-hint');
    hintTimer = setTimeout(() => { if (hint) hint.hidden = false; }, 20000);
    try {
      const tr = await openRoom('bs-' + code, { onJoinError: d => console.warn('join error', d) });
      if (cancelled) { tr.leave(); return; }
      session = createSession(tr, { host, version: ctx.data.version });
      if (status) status.textContent = host ? '相手を待っています…' : 'つないでいます…';
      const r = await session.handshake(host ? { ...rule } : undefined);
      if (cancelled) return;
      ctx.pvp = { session, rule: { ...r, summon: r.summon || 'stock' }, host, code };
      ctx.go('pvpSelect', {});
    } catch (e) {
      if (cancelled) return;
      cleanup(); session = null;
      await dialog({ title: 'つながりませんでした', text: e && e.code === 'version' ? `データのバージョンが違います（あなた v${ctx.data.version}）。\n両方がアプリを最新にして、もう一度試してください。` : '通信の部品を読み込めませんでした。\n通信の状態を確認して、もう一度試してください。' });
      mode = 'menu'; draw();
    }
  }

  function draw() {
    wrap.replaceChildren(bar('リンクバトル', () => { if (mode === 'menu') { cleanup(); ctx.go('battleMenu'); } else { cleanup(); mode = 'menu'; draw(); } }));
    const body = h('div', 'list detail-body');
    if (netKind() === 'local') body.append(h('p', 'sub warn', 'テスト用：同じブラウザの、別のタブとつながります'));
    if (mode === 'wait') {
      const box = h('div', 'panel pvp-wait');
      box.append(h('div', 'sec-l', code ? 'ゲートキー' : ''), h('div', 'pvp-code', code), h('p', 'sub pvp-status', 'つないでいます…'));
      const hint = h('p', 'sub warn pvp-hint', 'つながりにくいときは、両方が同じWi-Fiにつなぐか、アプリを開き直して、もう一度試してください。'); hint.hidden = true;
      const cancel = h('button', 'btn', 'やめる'); cancel.onclick = () => { cleanup(); mode = 'menu'; draw(); };
      box.append(hint, cancel); body.append(box);
    } else if (mode === 'setup') {   // ゲートを開く：条件を決めて、「決定」で、ゲートができる
      body.append(formationPanel(rule), summonPanel(rule));
      const open = h('button', 'btn primary big-btn', 'ゲートを開く');
      open.onclick = () => { code = randomCode(); connect(true); };
      body.append(open, h('p', 'sub', '開いたゲートの「ゲートキー」を、友だちに伝えてください。'));
    } else if (mode === 'join') {
      const jn = h('div', 'panel sel-sec');
      jn.append(h('div', 'sec-l', '友だちのゲートキー（6桁）を入れます'));
      const input = h('input', 'jan-input'); input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 6; input.placeholder = '000000'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'ゲートキー（6桁）');
      const go = h('button', 'btn primary big-btn', 'ゲートに入る'); go.disabled = true;
      input.oninput = () => { input.value = input.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 6); go.disabled = input.value.length !== 6; };
      go.onclick = () => { code = input.value; connect(false); };
      input.onkeydown = e => { if (e.key === 'Enter' && !go.disabled) go.click(); };
      jn.append(input, go); body.append(jn);
      setTimeout(() => input.focus(), 30);
    } else {
      const open = h('button', 'btn primary big-btn', 'ゲートを開く'); open.onclick = () => { mode = 'setup'; draw(); };
      const join = h('button', 'btn big-btn', 'ゲートに入る'); join.onclick = () => { mode = 'join'; draw(); };
      body.append(open, join, h('p', 'sub', '自分のスマホどうしでも、友だちとでも、遊べます。モバイル回線どうしだと、つながらないことがあります。'));
    }
    wrap.append(body);
  }
  draw();
  return cleanup;
}

// ---- 選出（持ち込み → 出撃メンバー） ----
export function pvpSelect(root, ctx) {
  const P = ctx.pvp;
  if (!P) { ctx.go('pvpLobby'); return; }
  const { session, rule } = P, { bring, fight } = rule;
  let phase = 'pool', pool = Array(bring).fill(null), party = [], sel = -1, oppPool = null, busy = false, alive = true;
  if (P.last && P.last.pool.length === bring) pool = P.last.pool.map(x => ({ ...x }));   // 再戦のとき、前の選び方を戻す
  const stockOf = jan => ctx.store.get().stock.find(x => x.jan === jan);
  const wrap = h('div', 'page sel'); root.append(wrap);
  const off = session.onChange(() => {
    if (!alive) return;
    const by = session.oppBye();
    if (by !== undefined) return fail({ code: 'bye', detail: by });   // 相手がやめたら、すぐ知らせる
    if (!busy) refreshStatus();
  });
  const cleanup = () => { alive = false; off(); };

  const fail = async e => {
    if (!alive) return;
    alive = false; await dialog({ title: '対戦が終わりました', text: errText(e) });
    endPvp(ctx); ctx.go('top');
  };
  // 相手を待つ間の表示。「やめる」で、対戦を抜ける
  async function waitOpp(promise) {
    busy = true; draw();
    const w = dialog({ text: '相手を待っています…', buttons: [{ label: '対戦をやめる', value: 'x' }] });
    const done = promise.then(v => ({ ok: true, v }), e => ({ ok: false, e }));
    const res = await Promise.race([done, w]);
    if (res === 'x') { alive = false; await session.bye('leave'); ctx.pvp = null; ctx.go('top'); return null; }
    w.close(); busy = false;
    if (!res.ok) { await fail(res.e); return null; }
    return res.v;
  }

  async function chooseFree(i) {
    const exclude = pool.filter((x, k) => x && k !== i).map(x => x.jan);
    const live = rule.summon === 'live';   // ライブスキャン：ストックは使わない
    const r = await pickMonster(ctx, { exclude, tabs: live ? ['summon'] : ['stock', 'summon'], title: '持ち込む仲間を選ぶ' });
    if (!r) return;
    const item = { jan: r.jan };
    if (!live && !stockOf(r.jan)) {
      const p = analyze(r.jan, ctx.data), f = createFighter(p);
      const c = await dialog({ title: '召喚！', text: `${p.monster.name}（${EL[p.monster.el].ja}属性）\nHP ${f.maxHp}／攻撃 ${f.base.atk}／魔法攻撃 ${f.base.mat}／SPD ${f.base.spd}`,
        buttons: [{ label: 'やめる', value: 'x' }, { label: 'この子で戦う', value: 'once' }, { label: '仲間に加えて戦う', value: 'save', primary: true }] });
      if (c !== 'once' && c !== 'save') return;
      item.saveOnStart = c === 'save';
    }
    pool[i] = item; sel = i; draw();
  }

  function detail(it) {
    const p = analyze(it.jan, ctx.data), f = createFighter(p), st = stockOf(it.jan);
    const box = h('div', 'panel sel-detail'), head = h('div', 'sd-head'), t = h('div', 'info');
    head.append(portrait(p.monster, { view: 'icon', cls: 'sm' }));
    t.append(h('div', 'name', st && st.nick ? `${st.nick}（${p.monster.name}）` : p.monster.name), h('div', 'sub', `${EL[p.monster.el].ja}属性${!st ? (it.saveOnStart ? '・仲間に加わる' : '・この試合だけ') : ''}`));
    head.append(t, elemIcon(p.monster.el));
    box.append(head, statsGrid(p, f), skillList(p));
    return box;
  }

  const statusLine = h('p', 'sub pvp-opp');
  function refreshStatus() {
    const tag = phase === 'pool' ? 'pool' : 'party', st = session.state();
    statusLine.textContent = !st.present ? '相手との接続が切れています…（もどるのを待ちます）' : session.hasOppCommit(tag) ? '相手は、決定しました。あなたも決めてください。' : '相手は、選んでいます…';
  }

  function draw() {
    wrap.replaceChildren();
    wrap.append(bar(phase === 'pool' ? 'リンクバトル 持ち込み' : 'リンクバトル 出撃メンバー', async () => {
      if (await confirmDialog('対戦をやめて、戻りますか？', 'やめる', '続ける')) { alive = false; await session.bye('leave'); ctx.pvp = null; ctx.go('top'); }
    }, ruleLabel(rule)));
    const body = h('div', 'list sel-body');
    const top = h('div', 'panel sel-sec');
    if (phase === 'pool') {
      top.append(h('div', 'sec-l', '相手の持ち込み（決まると、同時に見えます）'), statusLine);
    } else {
      top.append(h('div', 'sec-l', `相手の持ち込み（名前と属性だけ公開）`));
      const fr = h('div', 'pool'); fr.style.setProperty('--n', bring);
      oppPool.forEach(j => { const p = analyze(j, ctx.data), c = h('div', 'pcard'); c.append(portrait(p.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', p.monster.name), elemIcon(p.monster.el, 'sm')); fr.append(c); });
      top.append(fr, statusLine);
    }
    refreshStatus();
    const mine = h('div', 'panel sel-sec');
    const filled = pool.filter(Boolean).length;
    mine.append(h('div', 'sec-l', phase === 'pool' ? `あなたの持ち込み ${filled}/${bring}` : `あなたの出撃メンバー（出す順にタップ） ${party.length}/${fight}`));
    const mr = h('div', 'pool'); mr.style.setProperty('--n', bring);
    pool.forEach((it, i) => {
      const c = h('button', 'pcard' + (i === sel ? ' on' : '') + (party.includes(i) ? ' in' : ''));
      if (it) {
        const p = analyze(it.jan, ctx.data), st = stockOf(it.jan);
        c.append(portrait(p.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', st && st.nick ? st.nick : p.monster.name), elemIcon(p.monster.el, 'sm'));
        if (party.includes(i)) c.append(h('span', 'ord', String(party.indexOf(i) + 1)));
        c.onclick = () => {
          if (phase === 'party') { party = party.includes(i) ? party.filter(k => k !== i) : party.length < fight ? [...party, i] : party; }
          sel = i; draw();
        };
      } else { c.classList.add('empty'); c.append(h('div', 'plus', '＋'), h('div', 'pn', '選ぶ')); c.onclick = () => chooseFree(i); }
      if (busy) c.disabled = true;
      mr.append(c);
    });
    mine.append(mr);
    body.append(top, mine);
    if (sel >= 0 && pool[sel]) {
      body.append(detail(pool[sel]));
      if (phase === 'pool' && !busy) {
        const row = h('div', 'btn-row');
        const rep = h('button', 'btn small', '入れ替える'); rep.onclick = () => chooseFree(sel);
        const del = h('button', 'btn small', 'はずす'); del.onclick = () => { pool[sel] = null; sel = -1; draw(); };
        row.append(rep, del); body.append(row);
      }
    }
    wrap.append(body);

    const foot = h('div', 'detail-foot');
    const go = h('button', 'btn primary big-btn');
    if (phase === 'pool') { go.textContent = filled === bring ? '持ち込みを決定' : `あと${bring - filled}体、選んでください`; go.disabled = filled !== bring || busy; go.onclick = submitPool; }
    else { go.textContent = party.length === fight ? '出撃メンバーを決定' : `あと${fight - party.length}体、選んでください`; go.disabled = party.length !== fight || busy; go.onclick = submitParty; }
    foot.append(go); wrap.append(foot);
  }

  async function submitPool() {
    const mineJans = pool.map(x => x.jan);
    const opp = await waitOpp(session.exchange('pool', mineJans));
    if (!opp) return;
    if (!Array.isArray(opp) || opp.length !== bring || !opp.every(j => /^\d{13}$/.test(j))) return fail({ code: 'cheat' });
    oppPool = opp; phase = 'party'; party = []; sel = -1; draw();
  }
  async function submitParty() {
    const opp = await waitOpp(session.exchange('party', party));
    if (!opp) return;
    if (!Array.isArray(opp) || opp.length !== fight || new Set(opp).size !== fight || !opp.every(i => Number.isInteger(i) && i >= 0 && i < bring)) return fail({ code: 'cheat' });
    const seed = await waitOpp(session.seed());
    if (!seed) return;
    const mineTeam = party.map(i => pool[i].jan), oppTeam = opp.map(i => oppPool[i]);
    // 「仲間に加えて戦う」を選んだ子を、ストックに保存する
    ctx.store.update(s => { for (const it of pool) if (it && it.saveOnStart && !s.stock.some(x => x.jan === it.jan)) s.stock.push({ jan: it.jan, nick: '', date: today() }); });
    P.last = { pool: pool.map(it => it && { jan: it.jan }) };
    alive = false;
    ctx.go('match', { kind: 'pvp', mineJans: session.host ? mineTeam : oppTeam, foeJans: session.host ? oppTeam : mineTeam, pvp: { session, side: session.me, seed } });
  }
  draw();
  return cleanup;
}
