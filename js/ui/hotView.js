// クイックバトル：1台のスマホで、2人で対戦する（端末を渡しながら、選ぶ）
//   ルール設定 → 1人目：持ち込み・作戦 → 渡す → 2人目：持ち込み・作戦 → 渡す → 1人目：出撃メンバー → 渡す → 2人目：出撃メンバー → オートバトル
//   作戦＝CPUの考え方（威力重視・ダメージ予想など）。バトルは、2人の作戦で、自動で進む
import { h, today } from './dom.js';
import { dialog, confirmDialog } from './dialog.js';
import { portrait, elemIcon, EL, preloadMonsters } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { statsGrid, skillList } from './monsterInfo.js';
import { AI_LABELS } from './ai.js';
import { formationPanel, summonPanel } from './ruleui.js';
import { ruleLabel } from '../net/session.js';

const bar = (title, onBack, sub) => {
  const b = h('header', 'bar'), back = h('button', 'btn small', '戻る'); back.onclick = onBack;
  if (sub) { const t = h('div'); t.append(h('h1', '', title), h('div', 'sub', sub)); b.append(back, t); } else b.append(back, h('h1', '', title));
  return b;
};

// ---- ルール設定 ----
export function hotSetup(root, ctx) {
  const rule = (ctx.session.hotRule = ctx.session.hotRule || { bring: 3, fight: 3, summon: 'live' });
  const wrap = h('div', 'page');
  wrap.append(bar('クイックバトル', () => ctx.go('top')));
  const body = h('div', 'list detail-body');
  body.append(h('p', 'sub', '1台のスマホを、2人で順番に使います。持ち込みと作戦、出撃メンバーを、交代で決めて、そのあとは、オートバトルで決着します。'),
    formationPanel(rule), summonPanel(rule));
  wrap.append(body);
  const foot = h('div', 'detail-foot');
  const go = h('button', 'btn primary big-btn', '決定'); go.onclick = () => ctx.go('hotPlay');
  foot.append(go); wrap.append(foot); root.append(wrap);
}

// ---- 選出（交代で） ----
export function hotPlay(root, ctx) {
  const rule = ctx.session.hotRule || { bring: 3, fight: 3, summon: 'live' }, { bring, fight } = rule, live = rule.summon === 'live';
  const pools = [Array(bring).fill(null), Array(bring).fill(null)], parties = [[], []], ai = [2, 2];
  const steps = [{ k: 'pool', p: 0 }, { k: 'hand', to: 1 }, { k: 'pool', p: 1 }, { k: 'hand', to: 0 }, { k: 'party', p: 0 }, { k: 'hand', to: 1 }, { k: 'party', p: 1 }];
  let at = 0, sel = -1;
  const stockOf = jan => ctx.store.get().stock.find(x => x.jan === jan);
  const wrap = h('div', 'page sel'); root.append(wrap);
  const leave = async () => { if (await confirmDialog('対戦をやめて、戻りますか？', 'やめる', '続ける')) ctx.go('hotSetup'); };

  async function choose(p, i) {
    const exclude = pools[p].filter((x, k) => x && k !== i).map(x => x.jan);
    const r = await pickMonster(ctx, { exclude, tabs: live ? ['summon'] : ['stock', 'summon'], title: `${p + 1}人目：持ち込む仲間を選ぶ` });
    if (!r) return;
    const item = { jan: r.jan };
    if (!live && !stockOf(r.jan)) {
      const pr = analyze(r.jan, ctx.data), f = createFighter(pr);
      const c = await dialog({ title: '召喚！', text: `${pr.monster.name}（${EL[pr.monster.el].ja}属性）\nHP ${f.maxHp}／攻撃 ${f.base.atk}／魔法攻撃 ${f.base.mat}／SPD ${f.base.spd}`,
        buttons: [{ label: 'やめる', value: 'x' }, { label: 'この子で戦う', value: 'once' }, { label: '仲間に加えて戦う', value: 'save', primary: true }] });
      if (c !== 'once' && c !== 'save') return;
      item.saveOnStart = c === 'save';
    }
    pools[p][i] = item; sel = i; draw();
  }
  const detail = it => {
    const pr = analyze(it.jan, ctx.data), f = createFighter(pr), box = h('div', 'panel sel-detail'), head = h('div', 'sd-head'), t = h('div', 'info');
    head.append(portrait(pr.monster, { view: 'icon', cls: 'sm' }));
    t.append(h('div', 'name', pr.monster.name), h('div', 'sub', `${EL[pr.monster.el].ja}属性`));
    head.append(t, elemIcon(pr.monster.el));
    box.append(head, statsGrid(pr, f), skillList(pr));
    return box;
  };
  const cards = (list, onTap, party) => {
    const row = h('div', 'pool'); row.style.setProperty('--n', bring);
    list.forEach((it, i) => {
      const c = h('button', 'pcard' + (i === sel && onTap ? ' on' : '') + (party && party.includes(i) ? ' in' : ''));
      if (it) {
        const pr = analyze(it.jan, ctx.data);
        c.append(portrait(pr.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', pr.monster.name), elemIcon(pr.monster.el, 'sm'));
        if (party && party.includes(i)) c.append(h('span', 'ord', String(party.indexOf(i) + 1)));
      } else { c.classList.add('empty'); c.append(h('div', 'plus', '＋'), h('div', 'pn', '選ぶ')); }
      if (onTap) c.onclick = () => onTap(i); else c.disabled = true, c.style.pointerEvents = 'none';
      row.append(c);
    });
    return row;
  };
  const next = () => { at++; sel = -1; if (at >= steps.length) return start(); draw(); };

  function start() {
    ctx.store.update(s => { for (const pl of pools) for (const it of pl) if (it && it.saveOnStart && !s.stock.some(x => x.jan === it.jan)) s.stock.push({ jan: it.jan, nick: '', date: today() }); });
    const team = p => parties[p].map(i => pools[p][i].jan);
    ctx.go('match', { kind: 'hotseat', watch: true, mineJans: team(0), foeJans: team(1), aiA: ai[0], ai: ai[1], labels: { a: '1人目', b: '2人目' } });
  }

  function draw() {
    const st = steps[at];
    wrap.replaceChildren();
    if (st.k === 'hand') {   // 端末を渡す画面（前の人の選択は、見えない）
      wrap.append(bar('クイックバトル', leave));
      const box = h('div', 'panel pvp-wait');
      box.append(h('div', 'sec-l', ''), h('div', 'hand-msg', `端末を${st.to + 1}人目に渡してください`), h('p', 'sub', '相手の選んだものは、見えません。渡したら、次の人が押してください。'));
      const ok = h('button', 'btn primary big-btn', `${st.to + 1}人目：準備OK`); ok.onclick = next;
      box.append(ok); const list = h('div', 'list detail-body'); list.append(box); wrap.append(list);
      return;
    }
    const p = st.p;
    wrap.append(bar(`クイックバトル　${p + 1}人目`, leave, `${ruleLabel(rule)}`));
    const body = h('div', 'list sel-body');
    const foot = h('div', 'detail-foot'), go = h('button', 'btn primary big-btn');
    if (st.k === 'pool') {
      const filled = pools[p].filter(Boolean).length, mine = h('div', 'panel sel-sec');
      mine.append(h('div', 'sec-l', `${p + 1}人目の持ち込み ${filled}/${bring}`), cards(pools[p], i => { if (pools[p][i]) { sel = i; draw(); } else choose(p, i); }));
      body.append(h('p', 'sub warn', `${p + 1}人目の番です。相手は、見ないでください。`), mine);
      if (sel >= 0 && pools[p][sel]) {
        body.append(detail(pools[p][sel]));
        const row = h('div', 'btn-row'), rep = h('button', 'btn small', '入れ替える'), del = h('button', 'btn small', 'はずす');
        rep.onclick = () => choose(p, sel); del.onclick = () => { pools[p][sel] = null; sel = -1; draw(); };
        row.append(rep, del); body.append(row);
      }
      const aip = h('div', 'panel sel-sec'); aip.append(h('div', 'sec-l', '作戦（CPUの考え方）'));
      const seg = h('div', 'seg');
      AI_LABELS.forEach((l, i) => { const b = h('button', 'seg-b' + (ai[p] === i + 1 ? ' on' : ''), l); b.onclick = () => { ai[p] = i + 1; seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b)); }; seg.append(b); });
      aip.append(seg, h('p', 'sub', 'バトルは、この作戦で、自動で進みます。')); body.append(aip);
      go.textContent = filled === bring ? '決定' : `あと${bring - filled}体、選んでください`; go.disabled = filled !== bring; go.onclick = next;
      preloadMonsters(pools[p].filter(Boolean).map(it => analyze(it.jan, ctx.data).monster));
    } else {
      const opp = h('div', 'panel sel-sec');
      opp.append(h('div', 'sec-l', `${2 - p}人目の持ち込み（名前と属性だけ公開）`), cards(pools[1 - p], null));
      const mine = h('div', 'panel sel-sec'), party = parties[p];
      mine.append(h('div', 'sec-l', `${p + 1}人目の出撃メンバー（出す順にタップ） ${party.length}/${fight}`),
        cards(pools[p], i => { parties[p] = party.includes(i) ? party.filter(k => k !== i) : party.length < fight ? [...party, i] : party; sel = i; draw(); }, party));
      body.append(h('p', 'sub warn', `${p + 1}人目の番です。`), opp, mine);
      if (sel >= 0 && pools[p][sel]) body.append(detail(pools[p][sel]));
      go.textContent = party.length === fight ? (p === 1 ? '出撃メンバーを決定（バトル開始）' : '出撃メンバーを決定') : `あと${fight - party.length}体、選んでください`;
      go.disabled = party.length !== fight; go.onclick = next;
    }
    wrap.append(body); foot.append(go); wrap.append(foot);
  }
  draw();
}
