// バトルに入る演出：画面が光り、左右からモンスターが現れて、「VS」→「BATTLE START」
//   playIntro(root, { left:{ monster, label }, right:{ monster, label }, fx }) → 終わると解決する Promise。タップで飛ばせる
//   fx が false（オプションの「バトル演出」オフ）のときや、「動きを減らす」設定のときは、短い静止表示
import { h } from './dom.js';
import { portrait, elemIcon, EL } from './portrait.js';

const card = (side, { monster, label }) => {
  const c = h('div', `bi-side ${side}`), box = h('div', 'bi-card');
  box.style.setProperty('--el', EL[monster.el].c);
  const pt = h('div', 'bi-pt'); pt.append(portrait(monster, { view: 'front', fit: { scale: 1.05 } }));
  const nm = h('div', 'bi-name'); nm.append(h('span', 'bi-who', label || ''), h('b', '', monster.name), elemIcon(monster.el, 'sm'));
  box.append(pt, nm); c.append(box);
  return c;
};

export function playIntro(root, { left, right, fx = true }) {
  const still = !fx || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return new Promise(resolve => {
    const bi = h('div', 'bi' + (still ? ' still' : ''));
    bi.append(h('i', 'bi-bg'), card('R', right), card('L', left), h('div', 'bi-vs', 'VS'), h('div', 'bi-start', 'BATTLE START'), h('i', 'bi-flash'), h('i', 'bi-scan'));
    root.append(bi);
    let done = false;
    const end = () => { if (done) return; done = true; clearTimeout(t); bi.classList.add('out'); setTimeout(() => { bi.remove(); resolve(); }, still ? 0 : 250); };
    const t = setTimeout(end, still ? 900 : 2300);
    bi.addEventListener('click', end);   // タップで飛ばす
  });
}
