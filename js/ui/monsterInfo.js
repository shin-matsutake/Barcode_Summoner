// 能力値と技の表示（選出画面・タワーの仲間の一覧で共通）
import { h } from './dom.js';
import { elemIcon, EL } from './portrait.js';

const TYPE = { phys: '物理', mag: '魔法' };
const KIND = ['技A', '技B', '固有'];
export const pct = v => Math.round(v * 100) + '%';

export function statsGrid(p, f) {
  const grid = h('div', 'stats mini');
  [['HP', f.maxHp], ['攻撃', f.base.atk], ['魔法攻撃', f.base.mat], ['SPD', f.base.spd], ['物理耐性', pct(p.res.phys)], ['魔法耐性', pct(p.res.mag)]]
    .forEach(([l, v]) => { const c = h('div', 'stat'); c.append(h('span', '', l), h('b', '', String(v))); grid.append(c); });
  return grid;
}

export function skillList(p) {
  const sk = h('div', 'detail-skills');
  p.slots.forEach((s, i) => {
    const c = h('div', 'dskill mini' + (s.kind === 'U' ? ' uniq' : '')); c.style.setProperty('--el', EL[s.el].c);
    const hd = h('div', 'sk-head');
    hd.append(h('span', 'sk-kind', KIND[i]), h('b', 'sk-name', s.name), elemIcon(s.el, 'sm'), h('span', `tbadge tb-${s.type}`, TYPE[s.type]), h('span', 'sk-pow', `威力 ${s.power}`));
    c.append(hd, h('div', 'dtext', s.text)); sk.append(c);
  });
  return sk;
}
