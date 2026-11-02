// モンスターの絵。画像ファイルがなければ、属性色の丸と名前で仮表示する。
// images/monsters/monster_00.png（正面） monster_00_back.png（後ろ向き） monster_00_icon.png（顔アップ）
// 後ろ向き・顔アップがないときは正面を使う。images/elements/water.png などの属性アイコンも同様。
import { h } from './dom.js';

export const EL = {
  water: { ja: '水', c: '#3b8bff' }, fire: { ja: '火', c: '#ff6a3d' }, earth: { ja: '土', c: '#c0903f' },
  wind: { ja: '風', c: '#3fbf7f' }, light: { ja: '光', c: '#f2c53d' }, dark: { ja: '闇', c: '#8366e0' },
};
const missing = new Set();
const pad = n => String(n).padStart(2, '0');

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

export function portrait(monster, { view = 'front', cls = '' } = {}) {
  const box = h('div', `pt pt-${view} ${cls}`.trim());
  box.style.setProperty('--el', EL[monster.el].c);
  const ph = h('div', 'pt-ph');
  ph.append(h('b', '', EL[monster.el].ja));
  if (view !== 'icon') ph.append(h('span', '', monster.name));
  box.append(ph);
  const f = `images/monsters/monster_${pad(monster.id)}`;
  const list = view === 'back' ? [`${f}_back.png`, `${f}.png`] : view === 'icon' ? [`${f}_icon.png`, `${f}.png`] : [`${f}.png`];
  loadImage(list, img => { img.alt = monster.name; box.classList.add('has-img'); box.append(img); });
  return box;
}

export function elemIcon(el, cls = '') {
  const s = h('span', `eic ${cls}`.trim());
  s.style.setProperty('--el', EL[el].c);
  s.append(h('i', '', EL[el].ja));
  loadImage([`images/elements/${el}.png`], img => { img.alt = EL[el].ja; s.classList.add('has-img'); s.append(img); });
  return s;
}
