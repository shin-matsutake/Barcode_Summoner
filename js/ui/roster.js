// タワーの仲間（最大5体。加えたら、挑戦が終わるまで外せない）
//  towerRoster … 仲間の一覧    towerAdd … 仲間を加える（カメラ（準備中）→ 番号入力／ストックから）
import { h, today } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze, isValidCheckDigit } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { statsGrid, skillList } from './monsterInfo.js';
import { ROSTER_MAX } from '../storage.js';
import { stageOf } from '../data.js';

export const rosterOf = ctx => ctx.store.get().tower.roster;
export const inRoster = (ctx, jan) => rosterOf(ctx).includes(jan);
const stockOf = (ctx, jan) => ctx.store.get().stock.find(x => x.jan === jan);
const nameOf = (ctx, p) => { const st = stockOf(ctx, p.jan); return st && st.nick ? `${st.nick}（${p.monster.name}）` : p.monster.name; };

function backBar(title, onBack, sub) {
  const bar = h('header', 'bar'), b = h('button', 'btn small', '戻る'); b.onclick = onBack;
  if (sub) { const t = h('div'); t.append(h('h1', '', title), h('div', 'sub', sub)); bar.append(b, t); } else bar.append(b, h('h1', '', title));
  return bar;
}

// タワーの進み具合と仲間をリセット（確認つき）。やったら true
export async function resetTower(ctx, again) {
  const text = again
    ? '仲間と進み具合をリセットして、最初から挑戦します。\nストックの仲間は消えません。よろしいですか？'
    : 'タワーの仲間と進み具合を、すべてリセットします。\nストックの仲間は消えません。よろしいですか？';
  if (!(await confirmDialog(text, again ? 'もう一度挑戦' : 'やり直す'))) return false;
  ctx.store.update(s => { s.tower.roster = []; s.tower.cleared = 0; });
  for (const k of Object.keys(ctx.session)) if (k.startsWith('tower')) delete ctx.session[k];
  toast(again ? 'はじめから挑戦します' : 'リセットしました');
  return true;
}

// リセットのボタン（タワー画面・仲間の一覧で共通）。まだ何もないときは null
export function resetButton(ctx, after) {
  const t = ctx.store.get().tower, stages = ctx.data.tower.stages;
  const allClear = stages.length > 0 && t.cleared >= stages[stages.length - 1].stage;
  if (!allClear && !t.roster.length && !t.cleared) return null;
  const b = h('button', allClear ? 'btn primary big-btn' : 'btn small danger', allClear ? 'もう一度挑戦' : '最初からやり直す');
  b.onclick = async () => { if (await resetTower(ctx, allClear)) after(); };
  return b;
}

// 1体を仲間に加える（確認つき）。加えたら true
export async function addCompanion(ctx, jan) {
  if (inRoster(ctx, jan)) { toast('この子は、すでに仲間です'); return false; }
  if (rosterOf(ctx).length >= ROSTER_MAX) { await dialog({ title: '仲間はいっぱいです', text: `タワーの仲間は${ROSTER_MAX}体までです。\n挑戦が終わるまで、外すことはできません。` }); return false; }
  const p = analyze(jan, ctx.data), f = createFighter(p), st = stockOf(ctx, jan);
  const info = `${nameOf(ctx, p)}（${EL[p.monster.el].ja}属性）\nHP ${f.maxHp}／攻撃 ${f.base.atk}／魔法攻撃 ${f.base.mat}／SPD ${f.base.spd}`;
  const warn = '仲間に加えると、タワーの挑戦が終わるまで外せません。';
  let saveStock = false;
  if (st) {
    if (!(await confirmDialog(`${info}\n\n${warn}`, '仲間に加える', 'やめる'))) return false;
  } else {
    const c = await dialog({ title: '召喚！', text: `${info}\n\n${warn}\nストックにも保存すると、タワーが終わったあとも仲間として残ります。`,
      buttons: [{ label: 'やめる', value: 'x' }, { label: 'タワーだけ', value: 'tower' }, { label: 'ストックにも', value: 'both', primary: true }] });
    if (c !== 'tower' && c !== 'both') return false;
    saveStock = c === 'both';
  }
  ctx.store.update(s => {
    s.tower.roster.push(jan);
    if (saveStock && !s.stock.some(x => x.jan === jan)) s.stock.push({ jan, nick: '', date: today() });
  });
  toast('仲間に加えました');
  return true;
}

// ---- 仲間の一覧 ----
export function towerRoster(root, ctx) {
  const wrap = h('div', 'page');
  root.append(wrap);
  let openJan = null;
  const draw = () => {
    wrap.replaceChildren(backBar('タワーの仲間', () => ctx.go('tower')));
    const list = h('div', 'list detail-body'), roster = rosterOf(ctx);
    const head = h('div', 'panel roster-head');
    head.append(h('b', '', `${roster.length}/${ROSTER_MAX}体`), h('p', 'sub', '加えた仲間は、タワーの挑戦が終わるまで外せません。持ち込みと出撃の順番は、ステージごとに変えられます。'));
    list.append(head);
    for (let i = 0; i < ROSTER_MAX; i++) {
      const jan = roster[i];
      if (!jan) {
        const b = h('button', 'panel row row-btn roster-empty', '＋ 仲間を加える');
        b.disabled = false; b.onclick = () => ctx.go('towerAdd', { from: 'roster' });
        list.append(b); continue;
      }
      const p = analyze(jan, ctx.data), f = createFighter(p);
      const box = h('div', 'panel roster-item');
      const row = h('button', 'row row-btn');
      row.onclick = () => { openJan = openJan === jan ? null : jan; draw(); };
      const info = h('div', 'info');
      info.append(h('div', 'name', nameOf(ctx, p)), h('div', 'sub', `HP ${f.maxHp}　${stockOf(ctx, jan) ? 'ストックにもいる' : 'タワーだけの仲間'}`));
      row.append(portrait(p.monster, { view: 'icon', cls: 'sm' }), info, elemIcon(p.monster.el));
      box.append(row);
      if (openJan === jan) box.append(statsGrid(p, f), skillList(p));
      list.append(box);
    }
    wrap.append(list);
    const foot = h('div', 'detail-foot');
    const add = h('button', 'btn primary big-btn', roster.length >= ROSTER_MAX ? '仲間はいっぱいです' : '仲間を加える');
    add.disabled = roster.length >= ROSTER_MAX;
    add.onclick = () => ctx.go('towerAdd', { from: 'roster' });
    foot.append(add);
    const rb = resetButton(ctx, () => ctx.go('tower'));
    if (rb) foot.append(rb);
    wrap.append(foot);
  };
  draw();
}

// ---- 仲間を加える ----
// params: { stage, teamIdx, from: 'tower'|'roster'|'select' }
export function towerAdd(root, ctx, params = {}) {
  const { stage, teamIdx, from } = params;
  const stg = stage ? stageOf(ctx.data, stage) : null;
  let mode = 'camera';   // camera（準備中）→ number（番号入力）
  const wrap = h('div', 'page');
  root.append(wrap);

  const back = () => from === 'select' ? ctx.go('select', { stage, teamIdx, restore: true }) : from === 'roster' ? ctx.go('towerRoster') : ctx.go('tower');
  // 加えたあと：ステージに必要な数がそろったら選出へ。足りなければ続けて加える
  const afterAdd = () => {
    const n = rosterOf(ctx).length;
    if (stg && n >= stg.rule.bring) return ctx.go('select', { stage, teamIdx, restore: from === 'select' });
    if (n >= ROSTER_MAX) return back();
    draw();
  };

  const draw = () => {
    const roster = rosterOf(ctx), full = roster.length >= ROSTER_MAX;
    wrap.replaceChildren(backBar('仲間を加える', back, `タワーの仲間 ${roster.length}/${ROSTER_MAX}`));
    const body = h('div', 'list');
    if (stg) {
      const need = Math.max(0, stg.rule.bring - roster.length);
      if (need) body.append(h('div', 'panel need', `ステージ${stage}は${stg.rule.bring}体を持ち込みます。あと${need}体、仲間が必要です。`));
    }
    if (full) { body.append(h('div', 'panel need', '仲間はいっぱいです。')); wrap.append(body); return; }

    if (mode === 'camera') {
      const cam = h('div', 'panel cam-box');
      cam.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 20h12l4-6h16l4 6h12v32H8z"/><circle cx="32" cy="35" r="10"/><circle cx="32" cy="35" r="4"/></svg>';
      cam.append(h('p', 'big', 'カメラで読み取る'), h('p', 'sub warn', '準備中です'));
      const num = h('button', 'btn primary big-btn', '番号を入力する'); num.onclick = () => { mode = 'number'; draw(); };
      body.append(cam, num);
    } else {
      const box = h('div', 'panel summon-box');
      box.append(h('p', 'big', 'バーコードの13桁の数字を入力'));
      const input = h('input', 'jan-input'); input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 13; input.placeholder = '4901234567894'; input.autocomplete = 'off';
      const count = h('div', 'jan-count', '0/13');
      const ok = h('button', 'btn primary big-btn', '決定'); ok.disabled = true;
      input.oninput = () => {
        input.value = input.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 13);
        count.textContent = `${input.value.length}/13`; ok.disabled = input.value.length !== 13;
      };
      const submit = async () => {
        const jan = input.value;
        if (jan.length !== 13) return;
        if (!isValidCheckDigit(jan)) { await dialog({ title: '番号を確認してください', text: '13桁目の確認用の数字が合いません。打ち間違いがないか、もう一度見直してください。' }); return; }
        if (await addCompanion(ctx, jan)) afterAdd();
      };
      ok.onclick = submit; input.onkeydown = e => { if (e.key === 'Enter') submit(); };
      const cam = h('button', 'btn small', 'カメラに戻る'); cam.onclick = () => { mode = 'camera'; draw(); };
      box.append(input, count, ok, cam);
      body.append(box);
      setTimeout(() => input.focus(), 50);
    }
    const stk = h('button', 'btn', 'ストックから選ぶ');
    stk.onclick = async () => {
      const r = await pickMonster(ctx, { exclude: roster, tabs: ['stock'], title: 'ストックから仲間を選ぶ' });
      if (r && await addCompanion(ctx, r.jan)) afterAdd();
    };
    body.append(stk);
    wrap.append(body);
  };
  draw();
}
