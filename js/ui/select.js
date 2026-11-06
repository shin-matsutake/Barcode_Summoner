// 選出画面：相手の持ち込み（公開情報だけ）／自分の持ち込み（タワーの仲間から）／詳細／出撃メンバー（順番）
import { h } from './dom.js';
import { dialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { statsGrid, skillList } from './monsterInfo.js';
import { stageOf } from '../data.js';

export function select(root, ctx, params) {
  const { stage, teamIdx, restore } = params;
  const stg = stageOf(ctx.data, stage);
  const { bring, fight } = stg.rule;
  const foeTeam = stg.teams[teamIdx];
  const foeProf = foeTeam.map(j => analyze(j, ctx.data));
  const key = 'tower' + stage, old = restore && ctx.session[key];
  const roster = () => ctx.store.get().tower.roster;
  let pool, party, sel = -1;
  if (old) { // やり直し：前の選び方を戻す（仲間にいない子は外す）
    pool = old.pool.map(it => it && roster().includes(it.jan) ? it : null);
    party = old.party.filter(i => pool[i]);
  } else {
    pool = Array(bring).fill(null); party = [];
    if (roster().length === bring) pool = roster().map(j => ({ jan: j }));   // 仲間がちょうどの数なら、最初から入れておく
    if (bring === 1 && fight === 1 && pool[0]) party = [0];
  }
  const keep = () => { ctx.session[key] = { pool, party }; };
  const stockOf = jan => ctx.store.get().stock.find(x => x.jan === jan);
  const wrap = h('div', 'page sel');
  root.append(wrap);

  const addMore = () => { keep(); ctx.go('towerAdd', { stage, teamIdx, from: 'select' }); };

  async function choose(i) {
    const exclude = pool.filter((x, k) => x && k !== i).map(x => x.jan);
    if (!roster().some(j => !exclude.includes(j))) {
      const c = await dialog({ title: '仲間が足りません', text: `いま、タワーの仲間は${roster().length}体です。\nこのステージは${bring}体を持ち込みます。\n仲間を加えますか？`,
        buttons: [{ label: 'やめる', value: false }, { label: '仲間を加える', value: true, primary: true }] });
      if (c) addMore();
      return;
    }
    const r = await pickMonster(ctx, { exclude, tabs: ['roster'], title: '持ち込む仲間を選ぶ' });
    if (!r) return;
    pool[i] = { jan: r.jan };
    party = party.filter(k => k !== i);
    if (bring === 1 && fight === 1) party = [0];
    sel = i; keep(); draw();
  }

  function detailPanel() {
    const it = pool[sel], p = analyze(it.jan, ctx.data), f = createFighter(p), st = stockOf(it.jan);
    const box = h('div', 'panel sel-detail');
    const head = h('div', 'sd-head');
    head.append(portrait(p.monster, { view: 'icon', cls: 'sm' }));
    const t = h('div', 'info');
    t.append(h('div', 'name', st && st.nick ? `${st.nick}（${p.monster.name}）` : p.monster.name),
      h('div', 'sub', `${EL[p.monster.el].ja}属性`));
    head.append(t, elemIcon(p.monster.el));
    const grid = statsGrid(p, f), sk = skillList(p);
    const row = h('div', 'btn-row');
    const inP = party.includes(sel);
    const tog = h('button', 'btn primary small', inP ? '出撃から外す' : '出撃に入れる');
    tog.disabled = !inP && party.length >= fight;
    tog.onclick = () => { party = inP ? party.filter(k => k !== sel) : [...party, sel]; keep(); draw(); };
    const rep = h('button', 'btn small', '入れ替える'); rep.onclick = () => choose(sel);
    const del = h('button', 'btn small', '持ち込まない');
    del.onclick = () => { pool[sel] = null; party = party.filter(k => k !== sel); sel = -1; keep(); draw(); };
    row.append(tog, rep, del);
    box.append(head, grid, sk, row);
    return box;
  }

  function draw() {
    wrap.replaceChildren();
    const bar = h('header', 'bar'), back = h('button', 'btn small', '戻る'); back.onclick = () => ctx.go('tower');
    const tt = h('div'); tt.append(h('h1', '', `ステージ${stage} 選出`), h('div', 'sub', `${bring}体持ち込み・${fight}体で戦う`));
    bar.append(back, tt); wrap.append(bar);
    const body = h('div', 'list sel-body');

    const foe = h('div', 'panel sel-sec');
    foe.append(h('div', 'sec-l', '相手の持ち込み（名前と属性だけ公開）'));
    const fr = h('div', 'pool'); fr.style.setProperty('--n', bring);
    foeProf.forEach(p => { const c = h('div', 'pcard'); c.append(portrait(p.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', p.monster.name), elemIcon(p.monster.el, 'sm')); fr.append(c); });
    foe.append(fr);

    const filled = pool.filter(Boolean).length, mine = h('div', 'panel sel-sec');
    mine.append(h('div', 'sec-l', `あなたの持ち込み（タワーの仲間から） ${filled}/${bring}`));
    const mr = h('div', 'pool'); mr.style.setProperty('--n', bring);
    pool.forEach((it, i) => {
      const c = h('button', 'pcard' + (i === sel ? ' on' : '') + (party.includes(i) ? ' in' : ''));
      if (it) {
        const p = analyze(it.jan, ctx.data), st = stockOf(it.jan);
        c.append(portrait(p.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', st && st.nick ? st.nick : p.monster.name), elemIcon(p.monster.el, 'sm'));
        if (party.includes(i)) c.append(h('span', 'ord', String(party.indexOf(i) + 1)));
        c.onclick = () => { sel = i; draw(); };
      } else { c.classList.add('empty'); c.append(h('div', 'plus', '＋'), h('div', 'pn', '選ぶ')); c.onclick = () => choose(i); }
      mr.append(c);
    });
    mine.append(mr);
    if (filled < bring) {
      const have = roster().length;
      if (have < bring) {
        mine.append(h('p', 'sub warn', `あと${bring - have}体、仲間が必要です（いま${have}体）。`));
        const ad = h('button', 'btn small', '仲間を加える'); ad.onclick = addMore; mine.append(ad);
      } else mine.append(h('p', 'sub warn', `あと${bring - filled}体 選んでください。`));
    }
    body.append(foe, mine);
    if (sel >= 0 && pool[sel]) body.append(detailPanel());

    const pt = h('div', 'panel sel-sec');
    pt.append(h('div', 'sec-l', `出撃メンバー（出す順に ${fight}体）`));
    const pr = h('div', 'party');
    for (let k = 0; k < fight; k++) {
      const c = h('button', 'slot' + (party[k] != null ? ' on' : ''));
      if (party[k] != null) {
        const p = analyze(pool[party[k]].jan, ctx.data);
        c.append(portrait(p.monster, { view: 'icon', cls: 'sm' }), h('span', 'ord', String(k + 1)));
        c.onclick = () => { party = party.filter((_, q) => q !== k); keep(); draw(); };
      } else c.append(h('div', 'plus', `${k + 1}`));
      pr.append(c);
    }
    pt.append(pr); body.append(pt);
    wrap.append(body);

    const foot = h('div', 'detail-foot');
    const ready = filled === bring && party.length === fight;
    const go = h('button', 'btn primary big-btn', ready ? '決定（バトル開始）' : party.length < fight ? `出撃メンバーをあと${fight - party.length}体` : 'あと持ち込みが必要です');
    go.disabled = !ready;
    go.onclick = () => {
      keep();
      ctx.go('match', { kind: 'tower', stage, teamIdx, mineJans: party.map(i => pool[i].jan), foeJans: foeTeam.slice(0, fight), ai: stg.ai || 1 });
    };
    foot.append(go); wrap.append(foot);
  }
  draw();
}
