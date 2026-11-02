// 属性ルール：水→火→土→風→水（左が右に有利）／光⇔闇は相互に有利
export const ELEMENTS = ['water', 'fire', 'earth', 'wind', 'light', 'dark'];
const CYCLE = ['water', 'fire', 'earth', 'wind'];
export function beats(a, b) {
  const i = CYCLE.indexOf(a), j = CYCLE.indexOf(b);
  if (i >= 0 && j >= 0) return CYCLE[(i + 1) % 4] === b;
  return (a === 'light' && b === 'dark') || (a === 'dark' && b === 'light');
}
// その属性に対して有利な属性の一覧（＝弱点属性）
export function weakAgainst(el) { return ELEMENTS.filter(x => beats(x, el)); }
export const CONFIG = {
  DAMAGE_K: 1.4,      // 基本ダメージ係数（2→1.4に変更。テンポ調整用）
  MIN_DMG: 10,        // 最低保証ダメージ（無効化されなかった技のみ）
  MATCH: 1.5, ADV: 1.5, COMBO: 2.5, MISMATCH: 0.5,
  RAGE_START: 4, RAGE_STEP: 0.5,   // 4ターン目1.5倍、以降+0.5ずつ
  MAX_TURNS: 10, WARN_TURN: 8,     // 10ターン終了時に決着なし→相打ち
  STAT_MIN: 0.5, STAT_MAX: 2.0,    // 能力変化の倍率範囲（仮）
  RES_MAX: 0.9,
  // ---- 逆転要素の候補（検証用。すべてオフ＝未採用）----
  CRIT_CHANCE: 0, CRIT_MULT: 1.5,          // 会心：確率でダメージ増
  LASTSTAND_THR: 0, LASTSTAND_MULT: 1.5,   // 背水（検証用・未採用）：HPが一定割合以下の側の与ダメ増
  DMG_CAP_RATIO: 0,                        // 1発のダメージを最大HPのこの割合までに制限
  MIN_DMG_RATIO: 0,                        // 1発の最低ダメージを最大HPのこの割合に
  ENDURE_FULL_HP: false,                   // 満タンから一撃で倒される場合、HP1で耐える
  GUTS_K: 0,                               // 受けたダメージ(最大HP比)×K だけ次ターンの与ダメ増
  COMPRESS: 1, COMPRESS_MEAN: { hp: 3400, atk: 340, mat: 340, spd: 320 }, // 戦闘時ステータスを平均側へ圧縮(1=なし)
  CLASH_CANCELS_ORDER_EFFECTS: false, // true: 属性の打ち消しが起きたターンは、勝った側も先攻/後攻の効果が発動しない
};
