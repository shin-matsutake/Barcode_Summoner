// 図鑑の画面。モンスター100種（召喚したら登録。まだなら「？」）と、data/dex.json の entries（登場人物など）
//   一覧の絵は、画面に入ったときに読み込む（100枚をいっぺんに読まない）
import { h } from './dom.js?v=20261118-2';
import { portrait, elemIcon, EL } from './portrait.js?v=20261118-2';
import { ensureDexSeed } from './summonFx.js?v=20261118-2';
import { STAT_RULES } from '../core/jan.js?v=20261118-2';
import { dexCounts, dexComplete, SPECIES_TOTAL } from '../dex.js?v=20261118-2';
import { chipsOfSpecies } from './quality.js?v=20261118-2';

const pad = n => String(n).padStart(3, '0');
const KIND_JA = { character: '登場人物', reward: '報酬', special: '特別なモンスター' };
const clamp = (v, max) => Math.max(0, Math.min(max, v));
const TYPE = { phys: '物理', mag: '魔法' };

export function dexScreen(root, ctx) {
  ensureDexSeed(ctx);
  const dex = ctx.store.get().dex, entries = ctx.data.dex.entries, done = dexComplete(dex, entries);   // コンプリートは、非公開の欄も含めて判定する
  const counts = dexCounts(dex, entries.filter(e => !e.secret || dex.extra[String(e.id)]));          // 表示する数は、まだ見つけていない非公開の欄を、数に入れない
  const wrap = h('div', 'page dex');
  const bar = h('header', 'bar'), back = h('button', 'btn small', '戻る'); back.onclick = () => ctx.go('stock');
  bar.append(back, h('h1', '', '図鑑'));
  const body = h('div', 'list detail-body');

  // ---- 進み具合 ----
  const sum = h('div', 'panel dex-sum');
  const line = (label, seen, total) => { const r = h('div', 'dex-line'); r.append(h('span', '', label), h('b', '', `${seen}/${total}`)); const pb = h('div', 'dex-bar'); const i = h('i'); i.style.width = `${total ? (100 * seen / total) : 0}%`; pb.append(i); r.append(pb); return r; };
  sum.append(line('モンスター', counts.species.seen, counts.species.total));
  for (const [k, o] of Object.entries(counts.kinds)) sum.append(line(KIND_JA[k] || '特別', o.seen, o.total));
  if (done) sum.append(h('p', 'dex-done', '図鑑コンプリート！'));
  else sum.append(h('p', 'sub', 'モンスターは、召喚すると、図鑑に載ります（ストックに残さなくても、記録は残ります）。'));
  body.append(sum);

  // ---- 絵を、画面に入ったときに読み込む ----
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); if (e.target._load) e.target._load(); } }, { rootMargin: '240px' }) : null;
  const lazy = (box, load) => { box._load = load; if (io) io.observe(box); else load(); };

  // ---- モンスター100種 ----
  body.append(h('h2', 'dex-h', 'モンスター'));
  const grid = h('div', 'dex-grid');
  for (let id = 0; id < SPECIES_TOTAL; id++) {
    const m = ctx.data.monsters[id]; if (!m) continue;
    const seen = dex.seen[String(id)];
    const cell = h(seen ? 'button' : 'div', 'dex-cell' + (seen ? '' : ' unknown'));
    const pic = h('div', 'dex-pic');
    if (seen) { lazy(pic, () => pic.append(portrait(m, { view: 'icon', cls: 'sm' }))); cell.onclick = () => showSpecies(id); }
    else pic.append(h('span', 'dex-q', '？'));
    cell.append(pic, h('span', 'dex-no', `No.${pad(id)}`), h('span', 'dex-name', seen ? m.name : '？？？'));
    grid.append(cell);
  }
  body.append(grid);

  // ---- 登場人物・報酬・特別なモンスター（data/dex.json の entries）----
  const byKind = {};
  for (const e of entries) (byKind[e.kind || 'special'] ||= []).push(e);
  for (const [k, list] of Object.entries(byKind)) {
    const shown = list.filter(e => !e.secret || dex.extra[String(e.id)]);
    if (!shown.length) continue;
    body.append(h('h2', 'dex-h', KIND_JA[k] || '特別'));
    const g = h('div', 'dex-grid');
    for (const e of shown) {
      const got = dex.extra[String(e.id)];
      const cell = h(got ? 'button' : 'div', 'dex-cell' + (got ? '' : ' unknown'));
      const pic = h('div', 'dex-pic');
      if (got) {
        lazy(pic, () => { const im = h('img', 'dex-img'); im.alt = e.name || ''; im.src = e.image || ''; im.onerror = () => { im.remove(); pic.append(h('span', 'dex-q', (e.name || '？').slice(0, 1))); }; pic.append(im); });
        cell.onclick = () => showEntry(e);
      } else pic.append(h('span', 'dex-q', '？'));
      cell.append(pic, h('span', 'dex-no', `No.${pad(e.id)}`), h('span', 'dex-name', got ? (e.name || '') : '？？？'));
      g.append(cell);
    }
    body.append(g);
  }
  wrap.append(bar, body);
  root.append(wrap);

  // ---- 詳細（重ねて表示。端末の「戻る」でも閉じられる）----
  function overlay(title, content) {
    const layer = document.getElementById('dialog'), back2 = h('div', 'dlg-back'), box = h('div', 'dlg panel dex-detail');
    box.setAttribute('role', 'dialog');
    const close = h('button', 'btn primary', 'とじる'); close.dataset.back = '1'; close.onclick = () => back2.remove();
    const btns = h('div', 'dlg-btns'); btns.append(close);
    box.append(h('h2', 'dlg-title', title), content, btns); back2.append(box); layer.append(back2);
  }
  function showSpecies(id) {
    const m = ctx.data.monsters[id], r = dex.seen[String(id)], c = h('div', 'dex-d');
    const head = h('div', 'd-head');
    head.append(portrait(m, { view: 'front', cls: 'd-pic' }));
    const nm = h('div', 'd-name'); nm.append(elemIcon(m.el), h('b', '', m.name)); head.append(nm, chipsOfSpecies(id, r.bestLuck));
    head.append(h('p', 'sub', `召喚した数 ${r.n}回　初めて召喚した日 ${r.first || '-'}`));
    if (m.desc) head.append(h('p', 'sub desc', m.desc));
    const st = h('div', 'panel stats');
    for (const [label, k] of [['HP', 'hp'], ['攻撃', 'atk'], ['魔法攻撃', 'mat'], ['SPD', 'spd']]) {
      const G = STAT_RULES[k], lo = clamp(m.init[k] + Math.round(G.off), G.max), hi = clamp(m.init[k] + Math.round(G.off + 99 * G.k), G.max);
      const x = h('div', 'stat'); x.append(h('span', '', `${label}のはば`), h('b', '', `${lo}〜${hi}`)); st.append(x);
    }
    for (const [label, v] of [['物理耐性', m.res.phys], ['魔法耐性', m.res.mag]]) { const x = h('div', 'stat'); x.append(h('span', '', label), h('b', '', `${Math.round(v * 100)}%`)); st.append(x); }
    const u = m.unique, sk = h('div', 'panel dskill uniq'); sk.style.setProperty('--el', EL[u.el].c);
    const t = h('div', 'sk-head'); t.append(h('span', 'sk-kind', '固有'), h('b', 'sk-name', u.name), h('span', 'sk-pow', `威力 ${u.power}`));
    sk.append(t, h('div', 'sk-meta', `${EL[u.el].ja}属性・${TYPE[u.type]}`), h('div', 'dtext', u.text || ''));
    c.append(head, st, sk);
    overlay(`No.${pad(id)}`, c);
  }
  function showEntry(e) {
    const c = h('div', 'dex-d'), got = dex.extra[String(e.id)];
    const im = h('img', 'dex-bigimg'); im.alt = e.name || ''; im.src = e.image || ''; im.onerror = () => im.remove();
    c.append(im, h('div', 'd-name').appendChild(h('b', '', e.name || '')).parentNode);
    if (e.profile) c.append(h('p', 'sub desc', e.profile));
    c.append(h('p', 'sub', `登録した日 ${(got && got.first) || '-'}`));
    overlay(`No.${pad(e.id)}`, c);
  }
  return () => { if (io) io.disconnect(); };
}
