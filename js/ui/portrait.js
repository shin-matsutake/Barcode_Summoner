// モンスターの絵。画像ファイルがなければ、属性色の丸と名前で仮表示する。
// images/monsters/M000_F.png（正面） M000_B.png（後ろ向き）。番号は必ず3桁（000〜099）
// 後ろ向きがないときは正面を使う。顔アップ（アイコン）は、正面の上のほうを拡大して使う。
// どの絵も、描かれている範囲を測って、枠にぴったり合わせて表示する（sprite.js）。
// 属性アイコンは images/elements/fire.png（water／fire／earth／wind／light／dark。すべて小文字）
import { h } from './dom.js';
import { fitArt } from './sprite.js';

export const EL = {
  water: { ja: '水', c: '#3b8bff', g: '#fff' }, fire: { ja: '火', c: '#ff6a3d', g: '#fff' }, earth: { ja: '土', c: '#b07a35', g: '#fff' },
  wind: { ja: '風', c: '#3fbf7f', g: '#fff' }, light: { ja: '光', c: '#f4f1e0', g: '#2b2a20' }, dark: { ja: '闇', c: '#8366e0', g: '#fff' },   // c＝色、g＝丸の中の文字の色
};
const missing = new Set();
const pad = n => String(n).padStart(3, '0');

function loadImage(list, onOk) {
  const urls = list.filter(u => !missing.has(u));
  const next = i => {
    if (i >= urls.length) return;
    const img = new Image();
    img.onload = () => onOk(img);
    img.onerror = () => { missing.add(urls[i]); next(i + 1); };
    img.src = urls[i];
  };
  next(0);
}

// fit：{ scale, anchor } で、枠への合わせ方を変えられる（既定：全身を収めて足元をそろえる。アイコンは顔アップ）
export function portrait(monster, { view = 'front', cls = '', fit = {} } = {}) {
  const box = h('div', `pt pt-${view} ${cls}`.trim());
  box.style.setProperty('--el', EL[monster.el].c); box.style.setProperty('--g', EL[monster.el].g);
  const ph = h('div', 'pt-ph');
  ph.append(h('b', '', EL[monster.el].ja));
  box.append(ph);
  const f = `images/monsters/M${pad(monster.id)}`;
  const list = view === 'back' ? [`${f}_B.png`, `${f}_F.png`] : [`${f}_F.png`];
  loadImage(list, img => {
    img.alt = monster.name; box.classList.add('has-img'); box.append(img);
    fitArt(box, img, view === 'icon' ? { mode: 'bust', ...fit } : { mode: 'contain', anchor: 'bottom', ...fit });
  });
  return box;
}

export function elemIcon(el, cls = '') {
  const s = h('span', `eic ${cls}`.trim());
  s.style.setProperty('--el', EL[el].c); s.style.setProperty('--g', EL[el].g);
  s.append(h('i', '', EL[el].ja));
  loadImage([`images/elements/${el}.png`], img => { img.alt = EL[el].ja; s.classList.add('has-img'); s.append(img); });
  return s;
}
