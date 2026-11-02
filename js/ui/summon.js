// 召喚（番号の入力）・召喚の演出・モンスターの詳細（確認／ニックネーム）
import { h } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze, isValidCheckDigit } from '../core/jan.js';
import { createFighter } from '../core/battle.js';

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

// ---- 召喚する（13桁の入力） ----
export function summon(root, ctx) {
  const wrap = h('div', 'page');
  const bar = h('header', 'bar');
  const back = h('button', 'btn small', '戻る'); back.onclick = () => ctx.go('top');
  bar.append(back, h('h1', '', '召喚する'));
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
    if (inStock(ctx, jan)) { toast('この番号はすでに召喚済みです'); ctx.go('detail', { jan }); return; }
    ctx.go('summonFx', { jan });
  };
  go.onclick = submit;
  input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  const cam = h('button', 'btn', 'カメラで読み取る（準備中）'); cam.disabled = true;
  const test = h('button', 'btn small', 'テスト用：ランダムな番号を入れる');
  test.onclick = () => { input.value = randomJan(); input.oninput(); };
  box.append(input, count, go, cam, test);
  wrap.append(bar, box);
  root.append(wrap);
  setTimeout(() => input.focus(), 50);
}

// ---- 召喚の演出（光の輪が広がり、シルエットから絵が現れる） ----
export function summonFx(root, ctx, { jan }) {
  const p = analyze(jan, ctx.data);
  const fx = h('div', 'sfx');
  fx.style.setProperty('--el', EL[p.monster.el].c);
  fx.append(h('u', 'ring r1'), h('u', 'ring r2'), h('u', 'flash'));
  const pic = h('div', 'sfx-pic'); pic.append(portrait(p.monster, { view: 'front' }));
  const name = h('div', 'sfx-name'); name.append(h('span', '', '召喚成功'), h('b', '', p.monster.name));
  const skip = h('button', 'sfx-skip', 'タップで進む');
  fx.append(pic, name, skip);
  root.append(fx);
  let done = false;
  const next = () => { if (done) return; done = true; ctx.go('detail', { jan, isNew: true }); };
  fx.onclick = next;
  const t = setTimeout(next, 3600);
  return () => { done = true; clearTimeout(t); };
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
    if (!(await confirmDialog(msg, '魔界に戻す', 'やめる'))) return;
    if (!isNew) ctx.store.update(s => { s.stock = s.stock.filter(x => x.jan !== jan); s.fav = s.fav.filter(x => x !== jan); });
    toast('魔界に戻しました'); ctx.go(isNew ? 'summon' : 'stock');
  };
  foot.append(del);
  wrap.append(bar, body, foot);
  root.append(wrap);
}
