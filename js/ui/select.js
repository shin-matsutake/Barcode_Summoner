// 選出画面：相手の持ち込み（公開情報だけ）／自分の持ち込み／詳細／出撃メンバー（順番）
//   params.mode が 'code'（チームコード挑戦）… 自分の持ち込みは、ストック・番号から。仲間にいない子は「この試合だけ」も選べる
//   それ以外（CPUタワー） … 自分の持ち込みは、タワーの仲間から
import { h, today } from './dom.js';
import { dialog } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { statsGrid, skillList } from './monsterInfo.js';
import { stageOf } from '../data.js';
import { ROSTER_MAX } from '../storage.js';
import { summonLabel } from '../net/session.js';
import { preloadMonsters } from './portrait.js';

export function select(root, ctx, params) {
  const isCode = params.mode === 'code';
  const { stage, teamIdx, restore } = params;
  let bring, fight, foeTeam, title, subTitle, key, goBack, matchParams;
  const live = isCode && params.summon === 'live';   // ライブスキャン：その場で読み込んだ子だけ（ストックは使わない）
  if (isCode) {
    foeTeam = params.jans; bring = foeTeam.length; fight = params.fight;
    title = 'シミュレーション 選出'; key = 'code';
    goBack = () => ctx.go('simSetup');
    matchParams = pt => ({ kind: 'code', mineJans: pt, foeJans: foeTeam.slice(0, fight), ai: params.ai || 1, codeParams: { jans: foeTeam, fight, ai: params.ai || 1, summon: params.summon || 'stock' } });
  } else {
    const stg = stageOf(ctx.data, stage);
    ({ bring, fight } = stg.rule);
    foeTeam = stg.teams[teamIdx].slice(0, bring);   // 相手の持ち込み（データのチームが多くても、持ち込み数まで）
    title = `ステージ${stage} 選出`; key = 'tower' + stage;
    goBack = () => ctx.go('tower');
    matchParams = pt => ({ kind: 'tower', stage, teamIdx, mineJans: pt, foeJans: foeTeam.slice(0, fight), ai: stg.ai || 1 });
  }
  subTitle = `${bring}体持ち込み・${fight}体で戦う${isCode ? '・' + summonLabel(params.summon || 'stock') : ''}`;
  const foeProf = foeTeam.map(j => analyze(j, ctx.data));
  preloadMonsters(foeProf.map(p => p.monster));   // バトルの前に、相手の画像を読み込んでおく
  const old = restore && ctx.session[key];
  const roster = () => ctx.store.get().tower.roster;
  let pool, party, sel = -1;
  if (isCode) {
    pool = old ? old.pool : Array(bring).fill(null);
    party = old ? old.party.filter(i => pool[i]) : [];
    if (!old && bring === 1 && fight === 1) party = [];
  } else if (old) { // やり直し：前の選び方を戻す（仲間にいない子は外す）
    pool = old.pool.map(it => it && roster().includes(it.jan) ? it : null);
    party = old.party.filter(i => pool[i]);
  } else {
    pool = Array(bring).fill(null); party = [];
    if (roster().length <= bring) {   // 選ぶ余地がなければ、最初から入れておく
      roster().forEach((j, i) => { pool[i] = { jan: j }; });
      if (pool.filter(Boolean).length <= fight) party = pool.map((x, i) => x ? i : -1).filter(i => i >= 0);
    }
  }
  if (!isCode && params.addJan && roster().includes(params.addJan) && !pool.some(x => x && x.jan === params.addJan)) {   // 仲間を加えて戻ってきたとき、タップした枠に入れる
    const i = params.slot != null && !pool[params.slot] ? params.slot : pool.findIndex(x => !x);
    if (i >= 0) { pool[i] = { jan: params.addJan }; if (party.length < fight) party.push(i); }
  }
  const keep = () => { ctx.session[key] = { pool, party }; };
  const stockOf = jan => ctx.store.get().stock.find(x => x.jan === jan);
  const wrap = h('div', 'page sel');
  root.append(wrap);

  const addMore = slot => { keep(); ctx.go('towerAdd', { stage, teamIdx, from: 'select', slot }); };

  async function choose(i) {
    const exclude = pool.filter((x, k) => x && k !== i).map(x => x.jan);
    if (isCode) {   // ストック・番号から選ぶ。ストックにいない子は、この試合だけか、仲間に加えるかを選ぶ
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
      pool[i] = item;
      party = party.filter(k => k !== i);
      if (party.length < fight && bring <= fight) party.push(i);
      sel = i; keep(); draw();
      return;
    }
    const avail = roster().some(j => !exclude.includes(j)), canAdd = roster().length < ROSTER_MAX;
    let how = avail ? 'pick' : 'add';
    if (avail && canAdd) {   // 仲間から選ぶか、新しく召喚するか
      how = await dialog({ title: '仲間を選ぶ', text: 'タワーの仲間から選びますか？\n新しく召喚して、仲間に加えますか？',
        buttons: [{ label: 'やめる', value: '' }, { label: '仲間から', value: 'pick' }, { label: '新しく召喚', value: 'add', primary: true }] });
    }
    if (how === 'add') {
      if (!canAdd) { await dialog({ title: '仲間はいっぱいです', text: `タワーの仲間は${ROSTER_MAX}体までです。` }); return; }
      return addMore(i);
    }
    if (how !== 'pick') return;
    const r = await pickMonster(ctx, { exclude, tabs: ['roster'], title: '持ち込む仲間を選ぶ' });
    if (!r) return;
    pool[i] = { jan: r.jan };
    party = party.filter(k => k !== i);
    if (party.length < fight && (bring === 1 || roster().length <= fight)) party.push(i);
    sel = i; keep(); draw();
  }

  function detailPanel() {
    const it = pool[sel], p = analyze(it.jan, ctx.data), f = createFighter(p), st = stockOf(it.jan);
    const box = h('div', 'panel sel-detail');
    const head = h('div', 'sd-head');
    head.append(portrait(p.monster, { view: 'icon', cls: 'sm' }));
    const t = h('div', 'info');
    t.append(h('div', 'name', st && st.nick ? `${st.nick}（${p.monster.name}）` : p.monster.name),
      h('div', 'sub', `${EL[p.monster.el].ja}属性${isCode && !st ? (it.saveOnStart ? '・仲間に加わる' : '・この試合だけ') : ''}`));
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
    const bar = h('header', 'bar'), back = h('button', 'btn small', '戻る'); back.onclick = goBack;
    const tt = h('div'); tt.append(h('h1', '', title), h('div', 'sub', subTitle));
    bar.append(back, tt); wrap.append(bar);
    const body = h('div', 'list sel-body');

    const foe = h('div', 'panel sel-sec');
    foe.append(h('div', 'sec-l', '相手の持ち込み（名前と属性だけ公開）'));
    const fr = h('div', 'pool'); fr.style.setProperty('--n', bring);
    foeProf.forEach(p => { const c = h('div', 'pcard'); c.append(portrait(p.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', p.monster.name), elemIcon(p.monster.el, 'sm')); fr.append(c); });
    foe.append(fr);

    const filled = pool.filter(Boolean).length, mine = h('div', 'panel sel-sec');
    mine.append(h('div', 'sec-l', `あなたの持ち込み（${isCode ? (live ? 'その場で読み込み' : 'ストック・召喚から') : 'タワーの仲間から'}） ${filled}/${bring}`));
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
    if (filled < bring) mine.append(h('p', 'sub warn', isCode ? '空いている枠をタップして選びます（少ない人数でも挑戦できますが、不利になります）。' : '空いている枠をタップすると、仲間を選ぶ・召喚できます（少ない人数でも挑戦できますが、不利になります）。'));
    body.append(foe, mine);
    if (sel >= 0 && pool[sel]) body.append(detailPanel());

    const pt = h('div', 'panel sel-sec');
    pt.append(h('div', 'sec-l', `出撃メンバー（出す順に 最大${fight}体）${party.length < fight ? '　※相手は' + fight + '体です' : ''}`));
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
    const ready = party.length >= 1;
    const go = h('button', 'btn primary big-btn', !ready ? '出撃メンバーを選んでください' : party.length < fight ? `${party.length}体で挑戦する（不利）` : '決定（バトル開始）');
    go.disabled = !ready;
    go.onclick = () => {
      keep();
      if (isCode) {   // 「仲間に加えて戦う」を選んだ子を、ストックに保存する
        ctx.store.update(s => {
          for (const it of pool) if (it && it.saveOnStart && !s.stock.some(x => x.jan === it.jan)) s.stock.push({ jan: it.jan, nick: '', date: today() });
        });
        for (const it of pool) if (it) delete it.saveOnStart;   // 保存したので、やり直しのときに重ねて保存しない
      }
      ctx.go('match', matchParams(party.map(i => pool[i].jan)));
    };
    foot.append(go); wrap.append(foot);
  }
  draw();
}
