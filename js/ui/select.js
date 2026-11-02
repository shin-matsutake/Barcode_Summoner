// 選出画面：相手の持ち込み（公開情報だけ）／自分の持ち込み／詳細／出撃メンバー（順番）
import { h } from './dom.js';
import { dialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';

const TYPE = { phys: '物理', mag: '魔法' };
const KIND = ['技A', '技B', '固有'];
const pct = v => Math.round(v * 100) + '%';
const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

export function select(root, ctx, params) {
  const { stage, teamIdx, restore } = params;
  const stg = ctx.data.tower.stages.find(x => x.stage === stage);
  const { bring, fight } = stg.rule;
  const foeTeam = stg.teams[teamIdx];
  const foeProf = foeTeam.map(j => analyze(j, ctx.data));
  const key = 'tower' + stage, old = restore && ctx.session[key];
  let pool = old ? old.pool : Array(bring).fill(null), party = old ? old.party : [], sel = -1;
  const keep = () => { ctx.session[key] = { pool, party }; };
  const stockOf = jan => ctx.store.get().stock.find(x => x.jan === jan);
  const wrap = h('div', 'page sel');
  root.append(wrap);

  async function choose(i) {
    const exclude = pool.filter((x, k) => x && k !== i).map(x => x.jan);
    const r = await pickMonster(ctx, { exclude, tabs: ['stock', 'number'], title: '持ち込む仲間を選ぶ' });
    if (!r) return;
    let saveOnStart = false;
    if (!stockOf(r.jan)) { // ストックにいない個体：その場の召喚
      const p = analyze(r.jan, ctx.data), f = createFighter(p);
      const c = await dialog({ title: '召喚！', text: `${p.monster.name}（${EL[p.monster.el].ja}属性）\nHP ${f.maxHp}／攻撃 ${f.base.atk}／魔法攻撃 ${f.base.mat}／SPD ${f.base.spd}`,
        buttons: [{ label: 'やめる', value: 'x' }, { label: 'この子で戦う', value: 'use' }, { label: '仲間に加えて戦う', value: 'keep', primary: true }] });
      if (c !== 'use' && c !== 'keep') return;
      saveOnStart = c === 'keep';
    }
    pool[i] = { jan: r.jan, saveOnStart };
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
      h('div', 'sub', `${EL[p.monster.el].ja}属性${it.saveOnStart ? '・仲間に加わる' : st ? '' : '・この試合だけ'}`));
    head.append(t, elemIcon(p.monster.el));
    const grid = h('div', 'stats mini');
    [['HP', f.maxHp], ['攻撃', f.base.atk], ['魔法攻撃', f.base.mat], ['SPD', f.base.spd], ['物理耐性', pct(p.res.phys)], ['魔法耐性', pct(p.res.mag)]]
      .forEach(([l, v]) => { const c = h('div', 'stat'); c.append(h('span', '', l), h('b', '', String(v))); grid.append(c); });
    const sk = h('div', 'detail-skills');
    p.slots.forEach((s, i) => {
      const c = h('div', 'dskill mini' + (s.kind === 'U' ? ' uniq' : '')); c.style.setProperty('--el', EL[s.el].c);
      const hd = h('div', 'sk-head');
      hd.append(h('span', 'sk-kind', KIND[i]), h('b', 'sk-name', s.name), elemIcon(s.el, 'sm'), h('span', `tbadge tb-${s.type}`, TYPE[s.type]), h('span', 'sk-pow', `威力 ${s.power}`));
      c.append(hd, h('div', 'dtext', s.text)); sk.append(c);
    });
    const row = h('div', 'btn-row');
    const inP = party.includes(sel);
    const tog = h('button', 'btn primary small', inP ? '出撃から外す' : '出撃に入れる');
    tog.disabled = !inP && party.length >= fight;
    tog.onclick = () => { party = inP ? party.filter(k => k !== sel) : [...party, sel]; keep(); draw(); };
    const rep = h('button', 'btn small', '入れ替える'); rep.onclick = () => choose(sel);
    const del = h('button', 'btn small danger', '外す');
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
    mine.append(h('div', 'sec-l', `あなたの持ち込み ${filled}/${bring}`));
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
      const avail = ctx.store.get().stock.filter(x => !pool.some(p => p && p.jan === x.jan)).length, need = bring - filled;
      mine.append(h('p', 'sub warn', avail >= need ? `あと${need}体 選んでください。` : `あと${need}体 必要です（ストックは${avail}体）。「番号を入れる」でその場で召喚できます。`));
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
      ctx.store.update(s => {
        for (const it of pool) if (it && it.saveOnStart && !s.stock.some(x => x.jan === it.jan)) s.stock.push({ jan: it.jan, nick: '', date: today() });
      });
      keep();
      ctx.go('match', { kind: 'tower', stage, teamIdx, mineJans: party.map(i => pool[i].jan), foeJans: foeTeam.slice(0, fight), ai: stg.ai || 1 });
    };
    foot.append(go); wrap.append(foot);
  }
  draw();
}
