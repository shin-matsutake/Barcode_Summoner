// JANコード → 種・ステータス・技 を決める（足し算の下一桁方式）
// ステータス：桁の割り当てと、バーコード加算値 Z = round(off + base×k)（base は 00〜99）
// 加算値の幅は HP: 0〜4950 / ATK・MATK・SPD: 0〜495（逆転要素の候補として幅を狭める案を検証したが、未採用）
const G = {
  hp:  { t: [3, 5, 7],  o: [4, 6, 8],   off: 0, k: 50, max: 9999 },
  atk: { t: [5, 8, 9],  o: [6, 7, 10],  off: 0, k: 5,  max: 999 },
  mat: { t: [9, 12, 3], o: [10, 11, 4], off: 0, k: 5,  max: 999 },
  spd: { t: [4, 7, 9],  o: [5, 6, 11],  off: 0, k: 5,  max: 999 },
};
export const STAT_RULES = G;
// 技A・技B・モンスター種（種の桁は仮割り当て）
export const ID_DIGITS = {
  skillA:  { t: [3, 6, 10], o: [4, 9, 12] },
  skillB:  { t: [8, 11, 3], o: [7, 12, 5] },
  species: { t: [6, 8, 12], o: [3, 9, 11] },
};
export function isValidFormat(jan) { return /^\d{13}$/.test(jan); }
export function isValidCheckDigit(jan) { // 手入力の打ち間違い検出用
  if (!isValidFormat(jan)) return false;
  const d = [...jan].map(Number);
  const s = d.slice(0, 12).reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0);
  return (10 - (s % 10)) % 10 === d[12];
}
export function baseValue(d, g) { // 00〜99
  const sum = idx => idx.reduce((a, i) => a + d[i - 1], 0) % 10;
  return sum(g.t) * 10 + sum(g.o);
}
const clamp = (v, max) => Math.max(1, Math.min(max, v));

export function analyze(jan, data) {
  if (!isValidFormat(jan)) throw new Error('JANコードは13桁の数字です');
  const d = [...jan].map(Number);
  const speciesId = baseValue(d, ID_DIGITS.species);
  const monster = data.monsters[speciesId];
  const skillAId = baseValue(d, ID_DIGITS.skillA);
  const skillBId = baseValue(d, ID_DIGITS.skillB);
  const z = k => Math.round(G[k].off + baseValue(d, G[k]) * G[k].k);
  const stats = {
    hp:  clamp(monster.init.hp  + z('hp'),  G.hp.max),
    atk: clamp(monster.init.atk + z('atk'), G.atk.max),
    mat: clamp(monster.init.mat + z('mat'), G.mat.max),
    spd: clamp(monster.init.spd + z('spd'), G.spd.max),
  };
  const slots = [
    { slot: 0, kind: 'A', ...data.skills[skillAId] },
    { slot: 1, kind: 'B', ...data.skills[skillBId] },
    { slot: 2, kind: 'U', ...monster.unique },
  ];
  return { jan, speciesId, monster, stats, res: { phys: monster.res.phys, mag: monster.res.mag }, slots };
}
