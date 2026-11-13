// タワーの仲間（枠はステージと同じ数で、最大5体。空き枠があれば召喚できる。魔界に戻せるのは、決まった機会だけ。ルールは js/towerRules.js）
//  towerRoster … 仲間の一覧    towerAdd … 仲間を加える（カメラ（準備中）→ 番号入力／ストックから）
import { h, today } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze, isValidCheckDigit } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { pickMonster } from './picker.js';
import { cameraPanel } from './scanner.js';
import { statsGrid, skillList } from './monsterInfo.js';
import { ROSTER_MAX, rosterCap, releaseInfo, releaseText, addToRoster, releaseFromRoster, defaultTower } from '../towerRules.js';
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
  ctx.store.update(s => { s.tower = defaultTower(); });
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

// 仲間がいっぱいのとき、何をすればいいかの説明
export function fullMessage(ctx) {
  const t = ctx.store.get().tower, cap = rosterCap(t.cleared), r = releaseInfo(t);
  const head = cap < ROSTER_MAX ? `いまの仲間の枠は${cap}つです。ステージをクリアすると、1つずつ増えます。` : `タワーの仲間は${ROSTER_MAX}体までです。`;
  return { title: '仲間はいっぱいです', text: `${head}\n${r.can ? '先に、仲間を1体魔界に戻すと、新しく召喚できます。' : releaseText(t)}` };
}

// 1体を仲間に加える（確認つき）。加えたら true
const addBlock = (ctx, jan) => inRoster(ctx, jan) ? { text: 'この子は、すでに仲間です' }
  : ctx.store.get().tower.roster.length >= rosterCap(ctx.store.get().tower.cleared) ? fullMessage(ctx) : null;
async function showBlock(b) { if (b.title) await dialog(b); else toast(b.text); }

export async function addCompanion(ctx, jan) {
  const blk = addBlock(ctx, jan);
  if (blk) { await showBlock(blk); return false; }
  const p = analyze(jan, ctx.data), f = createFighter(p), st = stockOf(ctx, jan);
  const info = `${nameOf(ctx, p)}（${EL[p.monster.el].ja}属性）\nHP ${f.maxHp}／攻撃 ${f.base.atk}／魔法攻撃 ${f.base.mat}／SPD ${f.base.spd}`;
  const warn = '仲間に加えたあとは、魔界に戻せる機会が来るまで外せません。';
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
    addToRoster(s.tower, jan);
    if (saveStock && !s.stock.some(x => x.jan === jan)) s.stock.push({ jan, nick: '', date: today() });
  });
  toast('仲間に加えました');
  return true;
}

// 仲間を1体、魔界に戻す（確認つき）。戻したら true
export async function releaseCompanion(ctx, jan) {
  const t = ctx.store.get().tower, r = releaseInfo(t);
  if (!t.roster.includes(jan)) return false;
  if (!r.can) { await dialog({ title: '魔界に戻せません', text: releaseText(t) }); return false; }
  const p = analyze(jan, ctx.data), saved = !!stockOf(ctx, jan);
  const text = `${nameOf(ctx, p)}を魔界に戻します。\n${saved ? 'ストックには残ります。' : 'ストックにはいないので、この子は消えます。\n同じ番号で、また召喚できます。'}`
    + (r.mode === 'limited' ? `\n\n魔界に戻せる回数が、${r.left}回から${r.left - 1}回になります。` : '');
  if (!(await confirmDialog(text, '魔界に戻す', 'やめる'))) return false;
  let ok = false;
  ctx.store.update(s => { ok = releaseFromRoster(s.tower, jan); });
  if (ok) toast('魔界に戻しました');
  return ok;
}

// ---- 仲間の一覧 ----
export function towerRoster(root, ctx) {
  const wrap = h('div', 'page');
  root.append(wrap);
  let openJan = null;
  const draw = () => {
    wrap.replaceChildren(backBar('タワーの仲間', () => ctx.go('tower')));
    const list = h('div', 'list detail-body'), roster = rosterOf(ctx), t = ctx.store.get().tower, cap = rosterCap(t.cleared), rel = releaseInfo(t);
    const head = h('div', 'panel roster-head');
    head.append(h('b', '', `${roster.length}/${cap}体`), h('p', 'sub', `仲間の枠は、ステージをクリアするたびに1つ増えます（最大${ROSTER_MAX}体）。空き枠は、いつでも召喚できます。`), h('p', 'sub rel-line', releaseText(t)));
    list.append(head);
    for (let i = 0; i < ROSTER_MAX; i++) {
      const jan = roster[i];
      if (!jan) {
        if (i >= cap) {   // まだ開いていない枠
          list.append(h('div', 'panel row roster-empty roster-lock', `🔒 ステージ${i}をクリアすると開きます`));
          continue;
        }
        const b = h('button', 'panel row row-btn roster-empty', '＋ 仲間を加える');
        b.onclick = async () => { if (await confirmDialog('新しく召喚して、仲間に加えますか？', '召喚する', 'やめる')) ctx.go('towerAdd', { from: 'roster' }); };
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
      if (openJan === jan) {
        box.append(statsGrid(p, f), skillList(p));
        const rb = h('button', 'btn small danger', rel.can ? '魔界に戻す' : '魔界に戻せません（' + (rel.mode === 'limited' ? '回数がありません' : '負けたあとだけ') + '）');
        rb.disabled = !rel.can;
        rb.onclick = async () => { if (await releaseCompanion(ctx, jan)) { openJan = null; draw(); } };
        const rr = h('div', 'btn-row'); rr.append(rb); box.append(rr);
      }
      list.append(box);
    }
    wrap.append(list);
    const foot = h('div', 'detail-foot');
    const full = roster.length >= cap;
    const add = h('button', 'btn primary big-btn', full ? '仲間はいっぱいです' : '仲間を加える');
    add.disabled = full;
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
  let mode = params.pendingJan ? 'number' : 'camera';   // camera（準備中）→ number（番号入力）
  const wrap = h('div', 'page');
  root.append(wrap);

  const back = () => from === 'select' ? ctx.go('select', { stage, teamIdx, restore: true }) : from === 'roster' ? ctx.go('towerRoster') : ctx.go('tower');
  // 加えたあと：ステージに必要な数がそろったら選出へ。足りなければ続けて加える
  const afterAdd = () => {
    const roster = rosterOf(ctx);
    if (from === 'select') return ctx.go('select', { stage, teamIdx, restore: true, addJan: roster[roster.length - 1], slot: params.slot });
    if (roster.length >= rosterCap(ctx.store.get().tower.cleared)) return back();
    draw();
  };

  // 13桁が決まったあと：召喚の演出 → 戻ってきたら、仲間に加えるかの確認
  let cam = null;
  const stopCam = () => { if (cam) { cam.stop(); cam = null; } };
  const useJan = async jan => {
    const blk = addBlock(ctx, jan);
    if (blk) { await showBlock(blk); if (mode === 'camera') draw(); return; }
    ctx.go('summonFx', { jan, after: { screen: 'towerAdd', params: { ...params, pendingJan: jan } } });
  };

  const draw = () => {
    stopCam();
    const roster = rosterOf(ctx), cap = rosterCap(ctx.store.get().tower.cleared), full = roster.length >= cap;
    wrap.replaceChildren(backBar('仲間を加える', back, `タワーの仲間 ${roster.length}/${cap}`));
    const body = h('div', 'list');
    if (stg) {
      if (roster.length < stg.rule.bring) body.append(h('div', 'panel need', `ステージ${stage}は${stg.rule.bring}体まで持ち込めます（いま仲間は${roster.length}体）。少ない人数でも挑戦できますが、不利になります。`));
    }
    if (full) { body.append(h('div', 'panel need', fullMessage(ctx).text)); wrap.append(body); return; }

    if (mode === 'camera') {
      const box = h('div', 'panel summon-box');
      box.append(h('p', 'big', 'バーコードを読み取る'));
      cam = cameraPanel({ onJan: useJan, onManual: () => { mode = 'number'; draw(); } });
      box.append(cam.el); body.append(box);
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
        useJan(jan);
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
  if (params.pendingJan) addCompanion(ctx, params.pendingJan).then(ok => { if (ok) afterAdd(); });
  return stopCam;
}
