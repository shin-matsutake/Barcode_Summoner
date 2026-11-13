// CPUタワーのステージ一覧と、オートバトル（CPU同士の観戦。旧クイックバトル）
import { h } from './dom.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { AI_LABELS } from './ai.js';
import { story } from './dialog.js';
import { resetButton } from './roster.js';
import { ROSTER_MAX, rosterCap, releaseText } from '../towerRules.js';
import { stageOf, randomTeamIdx } from '../data.js';

function backBar(ctx, title) {
  const bar = h('header', 'bar'), b = h('button', 'btn small', '戻る');
  b.onclick = () => ctx.go('top'); bar.append(b, h('h1', '', title)); return bar;
}

// ステージに入る：ステージの前の文（intro。あれば）→ 選出（仲間が足りなくても入れる。空き枠から召喚できる）
// 相手チームは、そのステージをクリアするまで固定（出入りして、引き直せないように）
export async function enterStage(ctx, n) {
  const stg = stageOf(ctx.data, n);
  if (!stg) return ctx.go('tower');
  const t = ctx.store.get().tower, fixed = t.foe && t.foe.stage === n && stg.teams[t.foe.teamIdx] ? t.foe.teamIdx : null;
  if (fixed == null && stg.intro && n > t.cleared) await story(stg.intro, `ステージ${n}`);
  let teamIdx = fixed;
  if (teamIdx == null) { teamIdx = randomTeamIdx(stg); ctx.store.update(s => { s.tower.foe = { stage: n, teamIdx }; }); }
  ctx.go('select', { stage: n, teamIdx });
}

export function tower(root, ctx) {
  const wrap = h('div', 'page');
  wrap.append(backBar(ctx, 'CPUタワー'));
  const list = h('div', 'list'), t = ctx.store.get().tower, cleared = t.cleared;
  const stages = ctx.data.tower.stages;

  // 仲間の欄（押すと一覧）。塔の入口（いちばん下）に置く
  const rp = h('button', 'panel roster-panel');
  const rh = h('div', 'rp-head');
  const cap = rosterCap(cleared);
  rh.append(h('b', '', 'タワーの仲間'), h('span', 'rp-n', `${t.roster.length}/${cap}`));
  const faces = h('div', 'rp-faces');
  for (let i = 0; i < ROSTER_MAX; i++) {
    const j = t.roster[i];
    if (j) faces.append(portrait(analyze(j, ctx.data).monster, { view: 'icon', cls: 'xs' }));
    else faces.append(h('div', 'rp-empty' + (i >= cap ? ' rp-lock' : ''), i >= cap ? '🔒' : '＋'));   // 🔒＝まだ開いていない枠
  }
  rp.append(rh, faces, h('p', 'sub', t.roster.length ? 'タップで一覧を見る・仲間を加える・魔界に戻す' : 'まず、仲間を加えましょう'), h('p', 'sub rel-line', releaseText(t)));
  rp.onclick = () => ctx.go('towerRoster');

  // 塔：下（入口）から上（頂上）へ登る。上のステージほど、画面の上。まだ先のステージは「？？？」
  if (!stages.length) list.append(h('div', 'panel empty', 'タワーのデータがありません'));
  list.append(h('div', 'tower-top', '▲ 頂上'));
  let current = null;
  for (const stg of [...stages].reverse()) {
    const open = stg.stage <= cleared + 1, done = stg.stage <= cleared, far = stg.stage > cleared + 2;
    const b = h('button', 'panel stage' + (open ? '' : ' locked') + (done ? ' done' : '') + (far ? ' far' : ''));
    const info = h('div', 'info');
    if (far) info.append(h('div', 'name', `${stg.stage}F　？？？`), h('div', 'sub', 'まだ、見えません'));
    else info.append(h('div', 'name', `ステージ${stg.stage}`), h('div', 'sub', `${stg.rule.bring}体持ち込み・${stg.rule.fight}体で戦う`));
    b.append(info, h('span', 'st-tag', done ? 'クリア済み' : open ? '挑戦できる' : far ? '' : 'ロック中'));
    b.disabled = !open;
    b.onclick = () => enterStage(ctx, stg.stage);
    if (stg.stage === Math.min(cleared + 1, stages.length ? stages[stages.length - 1].stage : 1)) { b.classList.add('now'); current = b; }
    list.append(b);
  }
  list.append(h('div', 'tower-top bottom', '▼ 入口'), rp);
  const rb = resetButton(ctx, () => ctx.go('tower'));
  if (rb) list.append(rb);
  wrap.append(list); root.append(wrap);
  if (current) setTimeout(() => { try { current.scrollIntoView({ block: 'center' }); } catch (e) { /* 何もしない */ } }, 30);   // いまの階が、見えるところへ
}

export function auto(root, ctx) {
  const S = ctx.session.auto || (ctx.session.auto = { a: null, b: null, ai: 1 });
  const wrap = h('div', 'page');
  root.append(wrap);
  const draw = () => {
    wrap.replaceChildren(backBar(ctx, 'オートバトル'));
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
      pk.onclick = async () => { const r = await pickMonster(ctx, { tabs: ['stock', 'summon', 'random'], title: w === 'a' ? 'Aを選ぶ' : 'Bを選ぶ' }); if (r) { S[w] = r.jan; draw(); } };
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
    go.onclick = () => ctx.go('match', { kind: 'auto', mineJans: [S.a], foeJans: [S.b], ai: S.ai, aiA: S.ai, watch: true });
    foot.append(go); wrap.append(foot);
  };
  draw();
}
