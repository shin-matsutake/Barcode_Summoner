// 召喚（番号の入力）・召喚の演出・モンスターの詳細（確認／ニックネーム）
import { h } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze, isValidCheckDigit } from '../core/jan.js';
import { createFighter } from '../core/battle.js';
import { inRoster } from './roster.js';
import { findJan } from './summonFx.js';
import { cameraPanel } from './scanner.js';

const KIND = ['技A', '技B', '固有'];
const TYPE = { phys: '物理', mag: '魔法' };
const pct = v => Math.round(v * 100) + '%';
const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const inStock = (ctx, jan) => ctx.store.get().stock.find(s => s.jan === jan);

export function randomJan() { // テスト用：チェックデジットが正しい13桁をランダムに作る
  let s = ''; for (let i = 0; i < 12; i++) s += Math.floor(Math.random() * 10);
  const sum = [...s].reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0);
  return s + ((10 - (sum % 10)) % 10);
}

// ---- 召喚する（最初はカメラ。「番号を入力する」で手入力） ----
export function summon(root, ctx) {
  let mode = 'camera', cam = null;
  const wrap = h('div', 'page');
  root.append(wrap);
  const stopCam = () => { if (cam) { cam.stop(); cam = null; } };

  // 13桁が決まったあと：召喚済みなら詳細へ、はじめてなら演出へ
  const open = jan => {
    if (inStock(ctx, jan)) { toast('この番号はすでに召喚済みです'); ctx.go('detail', { jan }); return; }
    ctx.go('summonFx', { jan });
  };

  function numberBox() {
    const box = h('div', 'panel summon-box');
    box.append(h('p', 'big', 'バーコードの13桁の数字を入力'), h('p', 'sub', '商品のバーコードの下に印刷されている数字です。'));
    const input = h('input', 'jan-input');
    input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 13; input.placeholder = '4901234567894';
    input.autocomplete = 'off'; input.setAttribute('aria-label', 'バーコードの13桁');
    const count = h('div', 'jan-count', '0/13');
    const go = h('button', 'btn primary big-btn', '召喚する'); go.disabled = true;
    input.oninput = () => {
      input.value = input.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 13);
      count.textContent = `${input.value.length}/13`; go.disabled = input.value.length !== 13;
    };
    const submit = async () => {
      const jan = input.value;
      if (jan.length !== 13) return;
      if (!isValidCheckDigit(jan)) { await dialog({ title: '番号を確認してください', text: '13桁目の確認用の数字が合いません。打ち間違いがないか、もう一度見直してください。' }); return; }
      open(jan);
    };
    go.onclick = submit;
    input.onkeydown = e => { if (e.key === 'Enter') submit(); };
    const camBtn = h('button', 'btn', 'カメラで読み取る'); camBtn.onclick = () => { mode = 'camera'; draw(); };
    const test = h('button', 'btn small', 'テスト用：ランダムな番号を入れる');
    test.onclick = () => { input.value = randomJan(); input.oninput(); };
    box.append(input, count, go, camBtn, test);
    setTimeout(() => input.focus(), 50);
    return box;
  }

  // テスト用：演出を段階ごとに試す（保存しない）
  function demoBox() {
    const demo = h('div', 'panel opt demo-box');
    demo.append(h('p', 'sub', 'テスト用：召喚の演出を試す（保存されません）'));
    let rank = 'normal', tier = 1;
    const seg = (label, items, get, set) => {
      const row = h('div', 'seg'); row.append(h('span', 'seg-l', label));
      items.forEach(([v, l]) => { const b = h('button', 'seg-b' + (get() === v ? ' on' : ''), l); b.onclick = () => { set(v); row.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b)); }; row.append(b); });
      return row;
    };
    const play = h('button', 'btn small', 'この演出を見る');
    play.onclick = () => {
      const jan = findJan(ctx.data, { rank, tier });
      if (jan) ctx.go('summonFx', { jan, demo: true }); else toast('見つかりませんでした。もう一度押してください');
    };
    demo.append(
      seg('格', [['normal', '1重'], ['2', '2重'], ['3', '3重'], ['shatter', '砕ける']], () => rank, v => { rank = v; }),
      seg('運', [[0, '低'], [1, 'ふつう'], [2, '高'], [3, '最高']], () => tier, v => { tier = v; }),
      play);
    return demo;
  }

  function draw() {
    stopCam();
    const bar = h('header', 'bar');
    const back = h('button', 'btn small', '戻る'); back.onclick = () => ctx.go('top');
    bar.append(back, h('h1', '', '召喚する'));
    wrap.replaceChildren(bar);
    const body = h('div', 'list detail-body');
    if (mode === 'camera') {
      const box = h('div', 'panel summon-box');
      box.append(h('p', 'big', 'バーコードを読み取る'), h('p', 'sub', '商品のバーコード（13桁）を、カメラに映してください。'));
      cam = cameraPanel({ onJan: open, onManual: () => { mode = 'number'; draw(); } });
      box.append(cam.el);
      body.append(box);
    } else {
      body.append(numberBox(), demoBox());
    }
    wrap.append(body);
  }
  draw();
  return stopCam;
}

// ---- モンスターの詳細（召喚直後の確認と、ストックからの表示を兼ねる） ----
export function detail(root, ctx, { jan, isNew = false }) {
  const p = analyze(jan, ctx.data), f = createFighter(p);
  const saved = inStock(ctx, jan);
  const wrap = h('div', 'page detail');
  const bar = h('header', 'bar');
  if (!isNew) {
    const back = h('button', 'btn small', '戻る');
    back.onclick = () => ctx.go('stock');
    bar.append(back);
  }
  bar.append(h('h1', '', isNew ? '召喚した仲間' : 'ストックの仲間'));

  const body = h('div', 'list detail-body');
  const head = h('div', 'panel d-head');
  head.append(portrait(p.monster, { view: 'front', cls: 'd-pic' }));
  const nm = h('div', 'd-name'); nm.append(elemIcon(p.monster.el), h('b', '', p.monster.name));
  head.append(nm);
  if (p.monster.desc) head.append(h('p', 'sub desc', p.monster.desc));
  if (!isNew && inRoster(ctx, jan)) head.append(h('p', 'sub tower-tag', 'タワーの仲間（魔界に戻すのは、タワーの仲間の一覧から）'));
  const nickRow = h('label', 'nick');
  nickRow.append(h('span', '', 'ニックネーム'));
  const nick = h('input'); nick.type = 'text'; nick.maxLength = 10; nick.placeholder = '10文字まで（なくてもOK）';
  nick.value = saved ? saved.nick : '';
  nickRow.append(nick);
  head.append(nickRow);

  const st = h('div', 'panel stats');
  [['HP', f.maxHp], ['攻撃', f.base.atk], ['魔法攻撃', f.base.mat], ['SPD', f.base.spd], ['物理耐性', pct(p.res.phys)], ['魔法耐性', pct(p.res.mag)]]
    .forEach(([l, v]) => { const c = h('div', 'stat'); c.append(h('span', '', l), h('b', '', String(v))); st.append(c); });

  const sk = h('div', 'detail-skills');
  p.slots.forEach((s, i) => {
    const c = h('div', 'panel dskill' + (s.kind === 'U' ? ' uniq' : ''));
    c.style.setProperty('--el', EL[s.el].c);
    const t = h('div', 'sk-head');
    t.append(h('span', 'sk-kind', KIND[i]), h('b', 'sk-name', s.name), h('span', 'sk-pow', `威力 ${s.power}`));
    c.append(t, h('div', 'sk-meta', `${EL[s.el].ja}属性・${TYPE[s.type]}`), h('div', 'dtext', s.text));
    sk.append(c);
  });
  body.append(head, st, sk);

  const foot = h('div', 'detail-foot');
  const save = h('button', 'btn primary big-btn', isNew ? '仲間に加える' : 'ニックネームを保存');
  save.onclick = () => {
    const n = nick.value.trim().slice(0, 10);
    ctx.store.update(s => {
      const it = s.stock.find(x => x.jan === jan);
      if (it) it.nick = n; else s.stock.push({ jan, nick: n, date: today() });
    });
    toast(isNew ? '仲間に加えました' : '保存しました');
    ctx.go('stock');
  };
  foot.append(save);
  const del = h('button', 'btn small danger', '魔界に戻す');
  del.onclick = async () => {
    const msg = isNew ? '魔界に戻します。この仲間は保存されません。\n同じ番号で、また召喚できます。' : 'この仲間を魔界に戻します。ストックから消えます。\n同じ番号で、また召喚できます。';
    if (!isNew && inRoster(ctx, jan)) { await dialog({ title: '戻せません', text: 'この仲間は、タワーの仲間です。\n先に、タワーの仲間の一覧で魔界に戻してから、ストックから消してください。' }); return; }
    if (!(await confirmDialog(msg, '魔界に戻す', 'やめる'))) return;
    if (!isNew) ctx.store.update(s => { s.stock = s.stock.filter(x => x.jan !== jan); s.fav = s.fav.filter(x => x !== jan); });
    toast('魔界に戻しました'); ctx.go(isNew ? 'summon' : 'stock');
  };
  foot.append(del);
  wrap.append(bar, body, foot);
  root.append(wrap);
}
