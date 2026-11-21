// 格・運の表示（ストック・詳細・図鑑で使う小さな札）
//   運＝バーコードから決まる、4つの能力の平均の高さ（低 ☆☆☆／ふつう ★☆☆／高 ★★☆／最高 ★★★）
//   格＝種の番号で決まる輪の数（1重／2重／3重／砕ける）
// どちらも、強さの目安にはなるが、強さそのものではない（技や耐性で、同じ運でも大きく変わる）
import { h } from './dom.js?v=20261121-3';
import { fxLevel, luckTier, speciesRank } from './summonFx.js?v=20261121-3';

export const LUCK_JA = ['低', 'ふつう', '高', '最高'];
export const luckStars = tier => '★'.repeat(tier) + '☆'.repeat(3 - tier);
export const rankText = r => (r.shatter ? '砕ける' : `${r.rings}重`);

// 札の1枚。kind＝'luck'／'rank'
export function chip(kind, label, value, tier = 0) {
  const c = h('span', `chip chip-${kind}` + (kind === 'luck' ? ` lk${tier}` : ''));
  c.append(h('i', '', label), h('b', '', value));
  c.title = kind === 'luck' ? `運：${LUCK_JA[tier]}` : `格：${value}`;
  return c;
}

// 個体の札（運と格）
export function chipsOfJan(jan, data) {
  const box = h('div', 'chips');
  try { const lv = fxLevel(jan, data); box.append(chip('luck', '運', luckStars(lv.tier), lv.tier), chip('rank', '格', rankText(lv))); } catch (e) { /* 読めない番号は、何も出さない */ }
  return box;
}

// 種の札（格と、いちばん運のよかった個体の運）
export function chipsOfSpecies(id, bestLuck = null) {
  const box = h('div', 'chips');
  if (bestLuck != null) { const t = luckTier(bestLuck); box.append(chip('luck', '最高の運', luckStars(t), t)); }
  box.append(chip('rank', '格', rankText(speciesRank(id))));
  return box;
}
