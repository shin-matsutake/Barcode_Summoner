// 条件を設定する共通の部品（リンクバトルのゲートを開く画面と、シミュレーションの画面で使う）
//   rule＝{ bring, fight, summon } を、そのまま書き換える
import { h } from './dom.js';
import { RULES, SUMMON_RULES, formationNote } from '../net/session.js';

// 編成：持ち込み体数と、戦う体数（6通り）
export function formationPanel(rule, onChange = () => {}) {
  const p = h('div', 'panel sel-sec');
  p.append(h('div', 'sec-l', '編成（持ち込み・戦う体数）'));
  const grid = h('div', 'rule-grid');
  RULES.forEach(r => {
    const b = h('button', 'seg-b rule-btn' + (r.bring === rule.bring && r.fight === rule.fight ? ' on' : ''));
    b.append(h('span', 'rb-m', `${r.fight}対${r.fight}`), h('span', 'rb-s', formationNote(r)));
    b.onclick = () => { rule.bring = r.bring; rule.fight = r.fight; grid.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b)); onChange(rule); };
    grid.append(b);
  });
  p.append(grid);
  return p;
}

// 召喚ルール：ライブスキャン（その場で読み込んだ子だけ）／ストック解放
export function summonPanel(rule, onChange = () => {}) {
  const p = h('div', 'panel sel-sec');
  p.append(h('div', 'sec-l', '召喚ルール'));
  const seg = h('div', 'seg'), note = h('p', 'sub', '');
  const show = () => { note.textContent = (SUMMON_RULES.find(x => x.id === rule.summon) || SUMMON_RULES[1]).note; seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x.dataset.id === rule.summon)); };
  SUMMON_RULES.forEach(r => { const b = h('button', 'seg-b', r.label); b.dataset.id = r.id; b.onclick = () => { rule.summon = r.id; show(); onChange(rule); }; seg.append(b); });
  p.append(seg, note); show();
  return p;
}
