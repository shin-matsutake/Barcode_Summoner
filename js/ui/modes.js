// CPUタワーのステージ一覧と、クイックバトル（CPU同士の観戦）
import { h } from './dom.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { AI_LABELS } from './ai.js';

function backBar(ctx, title) {
  const bar = h('header', 'bar'), b = h('button', 'btn small', '戻る');
  b.onclick = () => ctx.go('top'); bar.append(b, h('h1', '', title)); return bar;
}

export function tower(root, ctx) {
  const wrap = h('div', 'page');
  wrap.append(backBar(ctx, 'CPUタワー'));
  const list = h('div', 'list'), cleared = ctx.store.get().tower.cleared;
  const stages = ctx.data.tower.stages;
  if (!stages.length) list.append(h('div', 'panel empty', 'タワーのデータがありません'));
  for (const stg of stages) {
    const open = stg.stage <= cleared + 1, done = stg.stage <= cleared;
    const b = h('button', 'panel stage' + (open ? '' : ' locked') + (done ? ' done' : ''));
    const t = h('div', 'info');
    t.append(h('div', 'name', `ステージ${stg.stage}`), h('div', 'sub', `${stg.rule.bring}体持ち込み・${stg.rule.fight}体で戦う`));
    b.append(t, h('span', 'st-tag', done ? 'クリア済み' : open ? '挑戦できる' : 'ロック中'));
    b.disabled = !open;
    b.onclick = () => ctx.go('select', { stage: stg.stage, teamIdx: Math.floor(Math.random() * stg.teams.length) });
    list.append(b);
  }
  wrap.append(list); root.append(wrap);
}

export function quick(root, ctx) {
  const S = ctx.session.quick || (ctx.session.quick = { a: null, b: null, ai: 1 });
  const wrap = h('div', 'page');
  root.append(wrap);
  const draw = () => {
    wrap.replaceChildren(backBar(ctx, 'クイックバトル'));
    const body = h('div', 'list');
    body.append(h('p', 'sub', '2体を選ぶと、CPUどうしが自動で戦います。'));
    for (const w of ['a', 'b']) {
      const box = h('div', 'panel qpick');
      box.append(h('div', 'sec-l', w === 'a' ? 'A（下側）' : 'B（上側）'));
      if (S[w]) {
        const p = analyze(S[w], ctx.data), f = createFighter(p);
        const row = h('div', 'row');
        row.append(portrait(p.monster, { view: 'icon', cls: 'sm' }));
        const t = h('div', 'info');
        t.append(h('div', 'name', p.monster.name), h('div', 'sub', `HP ${f.maxHp}／攻 ${f.base.atk}／魔 ${f.base.mat}／速 ${f.base.spd}`));
        row.append(t, elemIcon(p.monster.el));
        box.append(row);
      } else box.append(h('p', 'sub', 'まだ選んでいません'));
      const pk = h('button', 'btn small', S[w] ? '選び直す' : '選ぶ');
      pk.onclick = async () => { const r = await pickMonster(ctx, { tabs: ['stock', 'number', 'random'], title: w === 'a' ? 'Aを選ぶ' : 'Bを選ぶ' }); if (r) { S[w] = r.jan; draw(); } };
      box.append(pk); body.append(box);
    }
    const ai = h('div', 'panel opt');
    const hd = h('div', 'opt-head'); hd.append(h('span', '', 'CPUの考え方（両方に適用）')); ai.append(hd);
    const seg = h('div', 'seg');
    AI_LABELS.forEach((l, i) => { const b = h('button', 'seg-b' + (S.ai === i + 1 ? ' on' : ''), l); b.onclick = () => { S.ai = i + 1; draw(); }; seg.append(b); });
    ai.append(seg); body.append(ai);
    wrap.append(body);
    const foot = h('div', 'detail-foot');
    const go = h('button', 'btn primary big-btn', '対戦開始'); go.disabled = !(S.a && S.b);
    go.onclick = () => ctx.go('match', { kind: 'quick', mineJans: [S.a], foeJans: [S.b], ai: S.ai, aiA: S.ai, watch: true });
    foot.append(go); wrap.append(foot);
  };
  draw();
}
