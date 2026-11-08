import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyze, isValidCheckDigit, baseValue, ID_DIGITS, STAT_RULES } from '../js/core/jan.js';
import { beats, weakAgainst } from '../js/core/rules.js';
import { Rng } from '../js/core/rng.js';
import { normalizeScanned } from '../js/ui/scanner.js';
import { encodeTeam, parseTeam } from '../js/core/teamcode.js';
import { CONFIG } from '../js/core/rules.js';
const DEFAULT_K = CONFIG.DAMAGE_K, DEFAULT_LS = CONFIG.LASTSTAND_THR; CONFIG.DAMAGE_K = 2; CONFIG.LASTSTAND_THR = 0; // 手計算しやすいよう、ダメージ検証だけK=2・背水なしで行う
const DEFAULT_MULT = { MATCH: CONFIG.MATCH, ADV: CONFIG.ADV, COMBO: CONFIG.COMBO, DISADV: CONFIG.DISADV };
Object.assign(CONFIG, { MATCH: 1.5, ADV: 1.5, COMBO: 2.5, DISADV: 1 }); // 既存の手計算のテストは、旧い倍率（一致1.5・両方2.5・不利なし）で行う
import { startSeries, resolveSeriesTurn, simulateSeries } from '../js/core/series.js';
import { rageMult, calcDamage, createFighter, newBattle, resolveTurn, simulate, allowedSlots } from '../js/core/battle.js';
const data = {
  monsters: JSON.parse(fs.readFileSync('data/monsters.json')).monsters,
  skills: JSON.parse(fs.readFileSync('data/skills.json')).skills };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const rjan = r => Array.from({ length: 13 }, () => r.int(10)).join('');

t('属性相性', () => {
  assert(beats('fire', 'wind') && beats('wind', 'earth') && beats('earth', 'water') && beats('water', 'fire'));
  assert(!beats('wind', 'fire') && !beats('earth', 'wind') && !beats('water', 'earth') && !beats('fire', 'water'));
  assert(!beats('fire', 'water') && beats('light', 'dark') && beats('dark', 'light'));
  assert(!beats('light', 'fire') && !beats('fire', 'dark'));
  assert.deepEqual(weakAgainst('light'), ['dark']);
});
t('ステータス算出（手計算と一致）', () => {
  const jan = '4901234567894'; // ③=0 ④=1 ⑤=2 ⑥=3 ⑦=4 ⑧=5 → HP: 6と9 → 69×50=3450
  const d = [...jan].map(Number);
  assert.equal(baseValue(d, { t: [3, 5, 7], o: [4, 6, 8] }), 69);
  const p = analyze(jan, data);
  assert.equal(p.stats.hp, Math.max(1, Math.min(9999, p.monster.init.hp + Math.round(STAT_RULES.hp.off + 69 * STAT_RULES.hp.k)))); // 1240+69×25=2965
});
t('チェックデジット', () => { assert(isValidCheckDigit('4901234567894')); assert(!isValidCheckDigit('4901234567895')); });
t('00〜99が均等に出る（種・技A・技B）', () => {
  const r = new Rng(1); const N = 200000;
  for (const k of Object.keys(ID_DIGITS)) {
    const c = new Array(100).fill(0);
    for (let i = 0; i < N; i++) c[baseValue([...rjan(r)].map(Number), ID_DIGITS[k])]++;
    assert(Math.min(...c) > 1700 && Math.max(...c) < 2300, k);
  }
});
t('レイジ倍率', () => {
  assert.deepEqual([1, 3, 4, 5, 6, 7].map(rageMult), [1, 1, 1.5, 2, 2.5, 3]);
});
const mk = (el, atk = 200, mat = 200, spd = 100, hp = 3000, pr = 0, mr = 0, slots = []) => createFighter({
  monster: { name: 'm', el }, stats: { hp, atk, mat, spd }, res: { phys: pr, mag: mr }, slots });
const sk = (el, type, power, effects = []) => ({ name: el + type, el, type, power, effects });
t('ダメージ式（等倍・一致・特効・コンボ・逆補正・耐性）', () => {
  const dummy = mk('earth');
  assert.equal(calcDamage(mk('fire'), sk('light', 'phys', 100), dummy, 1), (200 + 100) * 2);        // 等倍
  assert.equal(calcDamage(mk('fire'), sk('fire', 'phys', 100), dummy, 1), 600 * 1.5);                 // 一致
  assert.equal(calcDamage(mk('fire'), sk('fire', 'phys', 100), mk('wind'), 1), 600 * 2.5);           // コンボ
  assert.equal(calcDamage(mk('fire'), sk('water', 'phys', 100), dummy, 1), (200 + 50) * 2);           // 逆補正
  assert.equal(calcDamage(mk('fire'), sk('light', 'phys', 100), mk('earth', 0, 0, 0, 3000, 0.3), 1), Math.round(600 * 0.7));
  assert.equal(calcDamage(mk('fire', 1, 1), sk('light', 'phys', 0), mk('earth', 0, 0, 0, 3000, 0.9), 1), 10); // 最低保証
  assert.equal(calcDamage(mk('light'), sk('dark', 'mag', 100), mk('light'), 1), (200 + 50) * 2 * 1.5);  // 光が闇技→逆補正＋特効
});
const slots3 = (a, b, c) => [{ slot: 0, ...a }, { slot: 1, ...b }, { slot: 2, ...c }];
t('下剋上で無効化（技の追加効果も不発）／最低保証は無効化時に適用されない', () => {
  const stun = sk('water', 'phys', 100, [{ op: 'stun' }]);
  const A = mk('fire', 200, 200, 200, 3000, 0, 0, slots3(stun, stun, stun));
  const B = mk('wind', 200, 200, 100, 3000, 0, 0, slots3(sk('fire', 'phys', 100), sk('fire', 'phys', 100), sk('fire', 'phys', 100)));
  const st = newBattle(A, B); resolveTurn(st, 0, 0, new Rng(1)); // 水技 vs 火技 → 水が勝つ
  assert.equal(A.hp, 3000); assert(B.hp < 3000); assert.equal(B.stunTurn, 2);
  const A2 = mk('fire', 200, 200, 200, 3000, 0, 0, slots3(sk('fire', 'phys', 100), sk('fire', 'phys', 100), sk('fire', 'phys', 100)));
  const B2 = mk('wind', 200, 200, 100, 3000, 0, 0, slots3(stun, stun, stun));
  const st2 = newBattle(A2, B2); resolveTurn(st2, 0, 0, new Rng(1)); // 火技が水技に無効化される
  assert.equal(A2.hp, 3000 - calcDamage(B2, stun, A2, 1)); assert.equal(B2.hp, 3000);
});
t('光と闇の技は相殺（ターン数は進む）', () => {
  const L = sk('light', 'phys', 100), D = sk('dark', 'phys', 100);
  const st = newBattle(mk('fire', 200, 200, 100, 3000, 0, 0, slots3(L, L, L)), mk('fire', 200, 200, 100, 3000, 0, 0, slots3(D, D, D)));
  resolveTurn(st, 0, 0, new Rng(1));
  assert.equal(st.a.hp, 3000); assert.equal(st.b.hp, 3000); assert.equal(st.turn, 2);
});
t('連続使用不可（前のターンの枠のみ）／行動不能の次は全枠使用可', () => {
  const S = sk('light', 'phys', 10);
  const a = mk('fire', 1, 1, 1, 9999, 0, 0, slots3(S, S, S)), b = mk('fire', 1, 1, 1, 9999, 0, 0, slots3(S, S, S));
  const st = newBattle(a, b); resolveTurn(st, 1, 2, new Rng(1));
  assert.deepEqual(allowedSlots(a, 2), [0, 2]); assert.deepEqual(allowedSlots(b, 2), [0, 1]);
  a.stunTurn = 2; assert.deepEqual(allowedSlots(a, 2), []);
  st.turn = 2; resolveTurn(st, null, 0, new Rng(1));
  assert.deepEqual(allowedSlots(a, 3), [0, 1, 2]);
});
t('10ターン終了で決着なし→相打ち', () => {
  const S = sk('light', 'phys', 10);
  const a = mk('fire', 1, 1, 1, 9999999, 0, 0.9, slots3(S, S, S)), b = mk('fire', 1, 1, 1, 9999999, 0, 0.9, slots3(S, S, S));
  const st = newBattle(a, b); const r = new Rng(3);
  while (!st.over) { resolveTurn(st, st.turn % 3, (st.turn + 1) % 3, r); }
  assert.equal(st.turn, 10); assert.equal(st.result, 'draw'); assert(st.log.some(e => e.t === 'mutualKO'));
});

// ---- 追加効果（実データで使われている種類）----
const run1 = (sa, sb, fa = {}, fb = {}) => { // 1ターンだけ実行して返す
  const A = mk(fa.el || 'fire', fa.atk ?? 200, 200, fa.spd ?? 200, fa.hp ?? 3000, 0, 0, slots3(sa, sa, sa));
  const B = mk(fb.el || 'light', fb.atk ?? 200, 200, fb.spd ?? 100, fb.hp ?? 3000, 0, 0, slots3(sb, sb, sb));
  const st = newBattle(A, B); resolveTurn(st, 0, 0, new Rng(1)); return { A, B, st };
};
const plain = sk('light', 'phys', 100);
t('先制ボーナス／追加攻撃／反動／吸収', () => {
  const base = run1(sk('light', 'phys', 100), plain).B.hp;
  const bonus = run1(sk('light', 'phys', 100, [{ op: 'bonus', power: 20, cond: 'first' }]), plain).B.hp;
  assert(bonus < base); // 先攻なので威力+20
  const slow = run1(sk('light', 'phys', 100, [{ op: 'bonus', power: 20, cond: 'last' }]), plain).B.hp;
  assert.equal(slow, base); // 先攻なので後攻ボーナスは無効
  const ex = run1(sk('light', 'phys', 100, [{ op: 'extra', type: 'mag', power: 50 }]), plain);
  assert.equal(3000 - ex.B.hp, 600 + (200 + 50) * 2);
  const rc = run1(sk('light', 'phys', 100, [{ op: 'recoil', ratio: 0.25 }]), sk('light', 'phys', 1));
  assert.equal(3000 - rc.A.hp > 0, true);
  const A = mk('fire', 200, 200, 200, 3000, 0, 0, slots3(sk('light', 'phys', 100, [{ op: 'drain', ratio: 0.5 }]), plain, plain));
  const B = mk('light', 200, 200, 100, 3000, 0, 0, slots3(plain, plain, plain)); A.hp = 1000;
  resolveTurn(newBattle(A, B), 0, 0, new Rng(1));
  assert.equal(A.hp, 1000 + 300 - 900); // 600与ダメの半分(300)回復→反撃(タイプ一致1.5倍)で900被弾
});
t('次ターン効果：先制／威力＋／ダメージ半減', () => {
  const A = mk('fire', 200, 200, 1, 3000, 0, 0, slots3(sk('light', 'phys', 100, [{ op: 'nextFirst' }, { op: 'nextHalf' }, { op: 'nextPower', n: 100 }]), plain, plain));
  const B = mk('light', 200, 200, 999, 9999, 0, 0, slots3(plain, plain, plain));
  const st = newBattle(A, B); const r = new Rng(1);
  resolveTurn(st, 0, 0, r); const hp1 = A.hp, bh = B.hp;
  resolveTurn(st, 1, 1, r);
  assert.equal(st.log.filter(e => e.t === 'hit' && e.who === 'a').at(-1).dmg, (200 + 100 + 100) * 2); // 威力＋100
  const hitB = st.log.filter(e => e.t === 'hit' && e.who === 'b').at(-1).dmg;
  assert.equal(hitB, Math.round((200 + 100) * 2 * 1.5 * 0.5)); // タイプ一致1.5倍→半減
  assert.equal(st.log.filter(e => e.t === 'hit').at(-2).who, 'a'); // 2ターン目はAが先制
});
t('必ず後攻／nullifyFoe／即死／デュエル', () => {
  const lastSk = sk('light', 'phys', 100, [{ op: 'forceLast' }]);
  const r = run1(lastSk, plain); assert.equal(r.st.log.find(e => e.t === 'hit').who, 'b');
  const nf = run1(sk('light', 'phys', 100, [{ op: 'nullifyFoe' }]), plain);
  assert.equal(nf.A.hp, 3000);
  const nfFirst = run1(sk('light', 'phys', 100, [{ op: 'nullifyFoe', cond: 'first' }]), plain, { spd: 1 }, { spd: 999 });
  assert(nfFirst.A.hp < 3000); // 後攻なので無効化なし
  const ko = run1(sk('light', 'phys', 100, [{ op: 'ohko', cond: 'foeEl:light' }]), plain);
  assert.equal(ko.B.hp, 0); assert.equal(ko.st.result, 'a');
  const duel = run1(sk('light', 'phys', 10, [{ op: 'forceLast' }, { op: 'duel' }]), sk('light', 'phys', 1), { hp: 9000 }, { hp: 3000 });
  assert.equal(duel.B.hp, 0);
});

t('共通技の効果：自分の行動不能／このターン半減／次ターン威力2倍／物理だけ無効化', () => {
  const rc = sk('light', 'phys', 100, [{ op: 'selfStun' }]);
  const A = mk('fire', 200, 200, 200, 9999, 0, 0, slots3(rc, plain, plain)), B = mk('light', 200, 200, 100, 9999, 0, 0, slots3(plain, plain, plain));
  const st = newBattle(A, B); resolveTurn(st, 0, 0, new Rng(1));
  assert.deepEqual(allowedSlots(A, 2), []); // 次のターン行動できない
  const A2 = mk('fire', 1, 1, 200, 9999, 0, 0, slots3(rc, plain, plain)), B2 = mk('light', 9999, 9999, 100, 1, 0, 0, slots3(plain, plain, plain));
  const st2 = newBattle(A2, B2); resolveTurn(st2, 0, 0, new Rng(1)); // 相手を倒したら行動不能にならない
  assert.deepEqual(allowedSlots(A2, 2).length, 2);
  const half = run1(sk('light', 'phys', 100, [{ op: 'halfNow', cond: 'first' }]), plain);
  const noHalf = run1(plain, plain);
  assert(3000 - half.A.hp < 3000 - noHalf.A.hp); // 先攻なので反撃のダメージが半分
  const dbl = sk('light', 'phys', 100, [{ op: 'nextPowerDouble', cond: 'first' }]);
  const D = mk('fire', 200, 200, 200, 99999, 0, 0, slots3(dbl, plain, plain)), E = mk('light', 1, 1, 100, 99999, 0, 0, slots3(plain, plain, plain));
  const s3 = newBattle(D, E); const rr = new Rng(1); resolveTurn(s3, 0, 0, rr); resolveTurn(s3, 1, 0, rr);
  assert.equal(s3.log.filter(e => e.t === 'hit' && e.who === 'a').at(-1).dmg, (200 + 100 * 2) * 2 * 1 * 1); // 技威力が2倍（K=2）
  // 追加攻撃は「威力倍」の対象外（5ターン目＝レイジ2.0倍、K=2）
  const dbx = sk('light', 'phys', 100, [{ op: 'extra', type: 'mag', power: 50 }]);
  const F = mk('fire', 200, 200, 200, 99999, 0, 0, slots3(dbl, dbx, plain)), G = mk('light', 1, 1, 100, 99999, 0, 0, slots3(plain, plain, plain));
  F.pending.powMult = 2;
  const s5 = newBattle(F, G); s5.turn = 5; resolveTurn(s5, 1, 0, new Rng(1));
  const h5 = s5.log.filter(e => e.t === 'hit' && e.who === 'a'); assert.equal(h5.length, 2);
  assert.equal(h5[0].dmg, (200 + 100 * 2) * 2 * 2.0); // 本体の威力は倍
  assert.equal(h5[1].dmg, (200 + 50) * 2 * 2.0);      // 追加攻撃は倍にならない
  const phys = sk('light', 'phys', 100, [{ op: 'nullifyFoe', cond: 'first', foeType: 'phys' }]);
  assert.equal(run1(phys, plain).A.hp, 3000); // 物理は無効化
  assert(run1(phys, sk('light', 'mag', 100)).A.hp < 3000); // 魔法は無効化されない
});

t('設定：打ち消し発生ターンは先攻/後攻の効果も不発（既定はOFF）', () => {
  const mkA = () => mk('fire', 200, 200, 200, 3000, 0, 0, slots3(sk('water', 'phys', 100, [{ op: 'bonus', power: 40, cond: 'first' }]), plain, plain));
  const mkB = () => mk('wind', 200, 200, 100, 3000, 0, 0, slots3(sk('fire', 'phys', 100), plain, plain)); // 水技が火技に勝つ
  const dmgOf = () => { const st = newBattle(mkA(), mkB()); resolveTurn(st, 0, 0, new Rng(1)); return st.log.find(e => e.t === 'hit' && e.who === 'a').dmg; };
  const off = dmgOf(); CONFIG.CLASH_CANCELS_ORDER_EFFECTS = true; const on = dmgOf(); CONFIG.CLASH_CANCELS_ORDER_EFFECTS = false;
  assert(off > on); // OFF：勝った側の先攻+40が発動／ON：発動しない
});

t('自傷（魔法）／相手の攻撃を打ち消した場合の追加攻撃／打消しが発生した場合の反撃／相手技の属性で吸収', () => {
  // 自傷：魔法ステータスで計算される
  const self = sk('fire', 'phys', 100, [{ op: 'selfAttack', power: 20, type: 'mag' }]);
  const A1 = mk('fire', 1, 500, 200, 9999, 0, 0, slots3(self, plain, plain)), B1 = mk('earth', 1, 1, 100, 9999, 0, 0, slots3(plain, plain, plain));
  const st1 = newBattle(A1, B1); resolveTurn(st1, 0, 0, new Rng(1));
  const selfDmg = calcDamage(A1, { el: 'fire', type: 'mag', power: 20 }, A1, 1);
  const bHit = st1.log.find(e => e.t === 'hit' && e.who === 'b').dmg;
  assert.equal(A1.hp, 9999 - selfDmg - bHit);
  // 打ち消した場合だけ追加攻撃
  const nf = sk('water', 'phys', 60, [{ op: 'extra', type: 'phys', power: 80, cond: 'nullifiedFoe' }]);
  const hitsOf = (foeSk) => {
    const A = mk('earth', 200, 200, 200, 99999, 0, 0, slots3(nf, nf, nf)), B = mk('earth', 200, 200, 100, 99999, 0, 0, slots3(foeSk, foeSk, foeSk));
    const st = newBattle(A, B); resolveTurn(st, 0, 0, new Rng(1)); return st.log.filter(e => e.t === 'hit' && e.who === 'a').length;
  };
  assert.equal(hitsOf(sk('fire', 'phys', 60)), 2);   // 水技が火技を打ち消した → 追加攻撃あり
  assert.equal(hitsOf(sk('light', 'phys', 60)), 1);  // 打ち消していない → 本体のみ
  // 光⇔闇の相殺でも「打消しが発生した場合」の追加攻撃は通る（本体は不発）
  const ctr = sk('light', 'phys', 100, [{ op: 'extra', type: 'phys', power: 100, cond: 'clash' }, { op: 'extra', type: 'mag', power: 100, cond: 'clash' }]);
  const A3 = mk('earth', 200, 200, 200, 3000, 0, 0, slots3(ctr, ctr, ctr)), B3 = mk('earth', 200, 200, 100, 3000, 0, 0, slots3(sk('dark', 'phys', 100), sk('dark', 'phys', 100), sk('dark', 'phys', 100)));
  const st3 = newBattle(A3, B3); resolveTurn(st3, 0, 0, new Rng(1));
  assert.equal(st3.log.filter(e => e.t === 'hit' && e.who === 'a').length, 2); // 追加攻撃2発
  assert(st3.log.some(e => e.t === 'nullified' && e.who === 'a')); // 本体は打ち消された
  assert.equal(A3.hp, 3000); assert(B3.hp < 3000); // Bの攻撃も相殺
  // 相手の技の属性が光なら、与えたダメージ分を回復
  const dr = sk('light', 'phys', 100, [{ op: 'drain', ratio: 1, cond: 'foeSkillEl:light' }]);
  const A4 = mk('earth', 200, 200, 200, 3000, 0, 0, slots3(dr, dr, dr)); A4.hp = 1000;
  const B4 = mk('earth', 200, 200, 100, 3000, 0, 0, slots3(sk('light', 'phys', 100), plain, plain));
  const st4 = newBattle(A4, B4); resolveTurn(st4, 0, 0, new Rng(1));
  const dealt = st4.log.find(e => e.t === 'hit' && e.who === 'a').dmg, taken = st4.log.find(e => e.t === 'hit' && e.who === 'b').dmg;
  assert.equal(A4.hp, 1000 + dealt - taken);
  const B5 = mk('earth', 200, 200, 100, 3000, 0, 0, slots3(sk('fire', 'phys', 100), plain, plain)), A5 = mk('earth', 200, 200, 200, 3000, 0, 0, slots3(dr, dr, dr)); A5.hp = 1000;
  const st5 = newBattle(A5, B5); resolveTurn(st5, 0, 0, new Rng(1)); // 相手が火技なら回復しない
  assert.equal(A5.hp, 1000 - st5.log.find(e => e.t === 'hit' && e.who === 'b').dmg);
});

t('背水（検証用の設定。標準はオフ）：HPが50%以下の側の与ダメージが1.5倍', () => {
  CONFIG.LASTSTAND_THR = 0.5;
  const a = mk('fire', 200, 200, 200, 3000, 0, 0, []), d = mk('earth', 200, 200, 200, 3000, 0, 0, []);
  const full = calcDamage(a, sk('light', 'phys', 100), d, 1); a.hp = 1500;
  const half = calcDamage(a, sk('light', 'phys', 100), d, 1); a.hp = 1501;
  const above = calcDamage(a, sk('light', 'phys', 100), d, 1);
  CONFIG.LASTSTAND_THR = 0;
  assert.equal(half, Math.round(full * 1.5)); assert.equal(above, full);
});
t('加算幅：HP 0〜4950 / 他 0〜495（標準）', () => {
  assert.equal(Math.round(STAT_RULES.hp.off + 99 * STAT_RULES.hp.k), 4950);
  assert.equal(Math.round(STAT_RULES.atk.off + 99 * STAT_RULES.atk.k), 495);
});

// ---- 勝ち抜き戦 ----
const prof = (el, atk, mat, spd, hp, slots, pr = 0, mr = 0) => ({ monster: { name: el + atk, el }, stats: { hp, atk, mat, spd }, res: { phys: pr, mag: mr }, slots: slots3(...slots) });
const runTurn = (s, a, b, r) => resolveSeriesTurn(s, a, b, r);
t('勝ち抜き：勝者のHPは持ち越し、負けた側は次の個体が全回復で登場', () => {
  const strong = prof('fire', 400, 400, 300, 5000, [plain, plain, plain]);
  const weak = () => prof('earth', 50, 50, 500, 400, [sk('light', 'phys', 100), plain, plain]);
  const s = startSeries([strong], [weak(), weak()]); const r = new Rng(1);
  const ev = runTurn(s, 0, 0, r);
  assert(ev.some(e => e.t === 'battleEnd' && e.result === 'a'));
  assert.equal(s.battleNo, 2); assert.equal(s.battle.turn, 1);
  assert(s.fighters.a.hp < 5000 && s.fighters.a.hp > 0);           // 受けたダメージはそのまま
  assert.equal(s.fighters.b.hp, s.fighters.b.maxHp);               // 新しい個体は全回復
  assert.equal(s.fighters.a.prevSlot, 0);                           // フィニッシュに使った枠(0)は、次の戦闘の1ターン目も使えない
  const hpBefore = s.fighters.a.hp; runTurn(s, 1, 1, r);
  assert(s.over && s.result === 'a'); assert(s.fighters.a.hp <= hpBefore);
});
t('勝ち抜き：威力アップ等は持ち越し／行動不能は持ち越さない', () => {
  const buff = sk('light', 'phys', 200, [{ op: 'stat', target: 'self', stat: 'atk', mult: 1.2, duration: 'perm' }, { op: 'nextPower', n: 100 }, { op: 'selfStun' }]);
  const hero = prof('fire', 300, 300, 300, 9000, [buff, plain, plain]);
  const mk1 = () => prof('earth', 1, 1, 1, 50, [plain, plain, plain]);
  const s = startSeries([hero], [mk1(), mk1()]); const r = new Rng(1);
  runTurn(s, 0, 0, r);                                              // 1体目を倒す（相手を倒したので行動不能にならない）
  assert.equal(s.fighters.a.stunTurn, -1);
  assert(s.fighters.a.mods.some(m => m.stat === 'atk' && m.until === Infinity)); // 能力アップは継続
  assert.equal(s.fighters.a.pending.powBonus, 100);                  // 次のターン効果も持ち越す
  const ev = runTurn(s, 1, 0, r);                                    // 次の戦闘の1ターン目：威力+100・ATK1.2倍
  const hit = ev.find(e => e.t === 'hit' && e.who === 'a');
  assert.equal(hit.dmg, Math.round((300 * 1.2 + (100 + 100)) * 2)); // ATK300×1.2（継続）、威力100＋100（次のターン効果）、K=2
  assert(s.over);
});
t('勝ち抜き：行動不能が残っていても、次の戦闘には持ち越さない', () => {
  const hero = prof('fire', 500, 500, 500, 9000, [plain, plain, plain]);
  const s = startSeries([hero], [prof('earth', 1, 1, 1, 50, [plain, plain, plain]), prof('earth', 1, 1, 1, 50, [plain, plain, plain])]);
  s.fighters.a.stunTurn = 2; // 拘束が付いた状態で倒したと仮定
  runTurn(s, 0, 0, new Rng(1));
  assert.equal(s.fighters.a.stunTurn, -1);
});
t('勝ち抜き：相打ちは両者退場、最後の1体どうしの相打ちは試合ドロー', () => {
  const tank = () => prof('fire', 1, 1, 1, 9999999, [plain, plain, plain], 0.9, 0.9);
  const s = simulateSeries([tank(), prof('fire', 500, 500, 500, 100, [plain, plain, plain])], [tank(), prof('fire', 1, 1, 1, 100, [plain, plain, plain])], new Rng(2));
  assert(s.over); assert(s.log.some(e => e.t === 'battleEnd' && e.result === 'draw'));
  assert(s.battleNo >= 2);                                           // 相打ちで両者が入れ替わり、次の戦闘が行われた
  const d = simulateSeries([tank()], [tank()], new Rng(3));
  assert.equal(d.result, 'draw');                                    // 最後の1体どうしの相打ち
});
t('勝ち抜き：判定勝ち（反動で同時に倒れた）も両者退場。最後の1体どうしは判定勝ちの側が試合の勝ち', () => {
  const rc = sk('light', 'phys', 100, [{ op: 'recoil', ratio: 0.5 }]);
  const A = () => prof('fire', 200, 200, 500, 100, [rc, rc, rc]), B = () => prof('earth', 1, 1, 1, 600, [plain, plain, plain]);
  const s = startSeries([A(), A()], [B(), B()]);
  runTurn(s, 0, 0, new Rng(1));
  assert(s.log.some(e => e.t === 'judgeWin' && e.who === 'b'));
  assert.deepEqual(s.idx, { a: 1, b: 1 });                           // 勝者も交代する
  assert(!s.over && s.battleNo === 2);
  assert.equal(s.fighters.b.hp, s.fighters.b.maxHp);                // 次の個体は全回復で登場
  const e = startSeries([A()], [B()]); runTurn(e, 0, 0, new Rng(1));
  assert(e.over); assert.equal(e.result, 'b');                      // 最後の1体：自分の効果で倒れた側の負け
});
t('勝ち抜き：フィニッシュに使った技は、次の戦闘の1ターン目も使えない（登場した相手は制限なし）', () => {
  const A = () => prof('fire', 500, 500, 500, 5000, [plain, plain, plain]), B = () => prof('earth', 1, 1, 1, 50, [plain, plain, plain]);
  const s = startSeries([A()], [B(), B()]);
  runTurn(s, 1, 0, new Rng(1));                                       // Aが技B(枠1)で1体目を倒す
  assert.equal(s.idx.b, 1); assert.equal(s.fighters.a.prevSlot, 1);
  assert.deepEqual(allowedSlots(s.fighters.a, s.battle.turn), [0, 2]); // 枠1は使えない
  assert.deepEqual(allowedSlots(s.fighters.b, s.battle.turn), [0, 1, 2]);
});
t('勝ち抜き：CPU同士で最後まで進む（3v3を2000試合）', () => {
  const r = new Rng(9); const rj = () => Array.from({ length: 13 }, () => r.int(10)).join('');
  const team = () => [0, 1, 2].map(() => analyze(rj(), data));
  const cnt = { a: 0, b: 0, draw: 0 };
  for (let i = 0; i < 2000; i++) { const s = simulateSeries(team(), team(), r); cnt[s.result]++; assert(s.battleNo <= 6); }
  assert(cnt.a > 700 && cnt.b > 700);
});

t('打ち消し：属性による打ち消しが最優先（技の効果の無効化は、属性で決まるターンには働かない）', () => {
  const mk = (el, slots) => ({ monster: { el, name: el }, stats: { hp: 3000, atk: 100, mat: 100, spd: 50 }, res: { phys: 0, mag: 0 }, slots });
  const sk = (el, effects) => ({ name: el + 'の技', el, type: 'phys', power: 50, kind: 'A', effects, text: '' });
  // 風は土に有利（風の技が土の技を打ち消す）。土の技が「相手の攻撃を無効」を持っていても、風の技は通り、土は打ち消される
  const wind = createFighter(mk('wind', [sk('wind', []), sk('wind', []), sk('wind', [])]));
  const earth = createFighter(mk('earth', [sk('earth', [{ op: 'nullifyFoe' }, { op: 'forceFirst' }]), sk('earth', []), sk('earth', [])]));
  const st = newBattle(wind, earth);
  const ev = resolveTurn(st, 0, 0, new Rng(1));
  assert(ev.some(e => e.t === 'clash' && e.b && !e.a), '土だけが打ち消される');
  assert(wind.hp === wind.maxHp, '風は無傷');
  assert(earth.hp < earth.maxHp, '風の攻撃は土に通る');
});

t('ヒットのイベント：追加攻撃には extra の印がつく（本体・反撃・コピーにはつかない）', () => {
  const mk = (el, slots) => ({ monster: { el, name: el }, stats: { hp: 3000, atk: 100, mat: 100, spd: 50 }, res: { phys: 0, mag: 0 }, slots });
  const sk = (el, effects) => ({ name: el + 'の技', el, type: 'phys', power: 50, kind: 'A', effects, text: '' });
  const a = createFighter(mk('fire', [sk('fire', [{ op: 'extra', type: 'mag', power: 30 }]), sk('fire', []), sk('fire', [])]));
  const b = createFighter(mk('light', [sk('light', []), sk('light', []), sk('light', [])]));
  const hits = resolveTurn(newBattle(a, b), 0, 0, new Rng(3)).filter(e => e.t === 'hit' && e.who === 'a');
  assert.deepEqual(hits.map(e => e.extra), [false, true]);
});

t('属性の倍率：一致1.2・有利1.5・両方2.0・不利0.8（光↔闇は不利なし）・逆補正0.5', () => {
  const sv = { ...CONFIG }; Object.assign(CONFIG, DEFAULT_MULT);
  try {
    assert.deepEqual({ M: CONFIG.MATCH, A: CONFIG.ADV, C: CONFIG.COMBO, D: CONFIG.DISADV }, { M: 1.2, A: 1.5, C: 2.0, D: 0.8 });
    const base = calcDamage(mk('fire'), sk('earth', 'phys', 100), mk('earth'), 1);   // 一致でも有利でも不利でもない＝等倍
    const near = (x, r) => assert(Math.abs(x - base * r) <= 1, `${x} ≠ ${base} × ${r}`);
    near(calcDamage(mk('fire'), sk('fire', 'phys', 100), mk('earth'), 1), 1.2);       // 一致
    near(calcDamage(mk('fire'), sk('wind', 'phys', 100), mk('earth'), 1), 1.5);       // 有利（風は土に強い）
    near(calcDamage(mk('fire'), sk('fire', 'phys', 100), mk('wind'), 1), 2.0);        // 両方（火は風に強い）
    near(calcDamage(mk('fire'), sk('earth', 'phys', 100), mk('wind'), 1), 0.8);       // 不利（風は土に強い＝土の技は風に通りにくい）
    near(calcDamage(mk('fire'), sk('fire', 'phys', 100), mk('water'), 1), 0.96);      // 一致×不利（水は火に強い）
    near(calcDamage(mk('light'), sk('light', 'phys', 100), mk('dark'), 1), 2.0);      // 光↔闇は互いに有利。不利は重ならない
    assert.equal(calcDamage(mk('light'), sk('dark', 'phys', 100), mk('light'), 1), (200 + 50) * 2 * 1.5);   // 光が闇の技：逆補正（威力半分）×有利（闇は光に強い）
  } finally { Object.assign(CONFIG, sv); }
});

t('カメラ：読み取った文字を13桁にそろえる（UPC-Aは先頭に0を足す。検算が合わないものは使わない）', () => {
  assert.equal(normalizeScanned('4901234567894'), '4901234567894');
  assert.equal(normalizeScanned(' 4901234567894\n'), '4901234567894');
  assert.equal(normalizeScanned('4901234567895'), null);          // 検算が合わない
  assert.equal(normalizeScanned('012345678905'), '0012345678905'); // UPC-A（12桁）
  assert.equal(normalizeScanned('012345678906'), null);
  assert.equal(normalizeScanned('49012347'), null);                // EAN-8
  assert.equal(normalizeScanned('abc'), null);
  assert.equal(normalizeScanned(null), null);
});

t('チームコード：作る・読む（長さ・重複・全角・区切りの文字。検算はしない）', () => {
  const A = '4901234567894', B = '4500000000018', C = '2701013043692';
  assert.equal(encodeTeam([A]), '1' + A);
  assert.equal(encodeTeam([A, B, C]), '3' + A + B + C);
  assert.deepEqual(parseTeam(encodeTeam([A, B])), { ok: true, jans: [A, B] });
  assert.deepEqual(parseTeam(' 2 ' + A + '\n' + B + ' ').jans, [A, B]);                 // 空白・改行は無視
  assert.deepEqual(parseTeam('２' + A + B).jans, [A, B]);                                // 全角の数字
  assert.equal(parseTeam('').ok, false);
  assert.equal(parseTeam('abc').ok, false);
  assert.equal(parseTeam('0' + A).ok, false);                                            // 体数が0
  assert.equal(parseTeam('6' + A).ok, false);                                            // 体数が6
  assert.match(parseTeam('2' + A).error, /長さが合いません/);                              // 欠けている
  assert.equal(parseTeam('1' + '4901234567895').ok, true);                               // 13桁目の検算は、コードでは見ない（仕様書どおり）
  assert.match(parseTeam('2' + A + A).error, /重なって/);                                // 重複
  assert.equal(encodeTeam([A, B, C, '9339835287081', '6354601642041']).length, 66);       // 最大66桁
  assert.throws(() => encodeTeam([]));
  assert.throws(() => encodeTeam([A, B, C, A, B, C]));
});

t('タワー：data/tower.json の形式（5ステージ×3チーム、持ち込み体数、JANの妥当性）', () => {
  const tw = JSON.parse(fs.readFileSync('data/tower.json')).stages;
  const rules = [[1, 1], [2, 2], [3, 2], [3, 3], [5, 3]];
  assert.equal(tw.length, 5);
  tw.forEach((s, i) => {
    assert.equal(s.stage, i + 1); assert.deepEqual([s.rule.bring, s.rule.fight], rules[i]); assert.equal(s.teams.length, 3);
    for (const team of s.teams) {
      assert.equal(team.length, s.rule.bring); assert.equal(new Set(team).size, team.length);
      for (const j of team) { assert(isValidCheckDigit(j)); analyze(j, data); }
    }
  });
});

t('ログ用イベント：回復・反動・自傷・即死に「量」つきのイベントが出る', () => {
  const rc = sk('light', 'phys', 100, [{ op: 'recoil', ratio: 0.25 }, { op: 'selfDamage', n: 50 }]);
  const A = mk('fire', 200, 200, 200, 3000, 0, 0, slots3(rc, plain, plain)), B = mk('earth', 1, 1, 100, 3000, 0, 0, slots3(plain, plain, plain));
  const st = newBattle(A, B); resolveTurn(st, 0, 0, new Rng(1));
  const hit = st.log.find(e => e.t === 'hit' && e.who === 'a'), rcv = st.log.find(e => e.t === 'selfDamage' && e.cause === 'recoil'), sd = st.log.find(e => e.t === 'selfDamage' && e.cause === 'selfDamage');
  assert.equal(rcv.n, Math.round(hit.dmg * 0.25)); assert.equal(rcv.hp, 3000 - rcv.n); assert.equal(sd.n, 50); assert.equal(sd.hp, 3000 - rcv.n - 50);
  const dr = sk('light', 'phys', 100, [{ op: 'drain', ratio: 0.5 }]);
  const A2 = mk('fire', 200, 200, 200, 3000, 0, 0, slots3(dr, plain, plain)), B2 = mk('earth', 1, 1, 1, 3000, 0, 0, slots3(plain, plain, plain)); A2.hp = 1000;
  const st2 = newBattle(A2, B2); resolveTurn(st2, 0, 0, new Rng(1));
  const h2 = st2.log.find(e => e.t === 'heal'); assert.equal(h2.who, 'a'); assert.equal(h2.n, Math.round(st2.log.find(e => e.t === 'hit' && e.who === 'a').dmg * 0.5)); assert.equal(h2.hp, 1000 + h2.n);
  const ko = sk('light', 'phys', 100, [{ op: 'ohko', cond: 'foeEl:light' }]);
  const st3 = newBattle(mk('fire', 200, 200, 200, 3000, 0, 0, slots3(ko, ko, ko)), mk('light', 1, 1, 1, 3000, 0, 0, slots3(plain, plain, plain)));
  resolveTurn(st3, 0, 0, new Rng(1)); assert(st3.log.some(e => e.t === 'hpSet' && e.target === 'b' && e.cause === 'ohko'));
});

// ---- 2026-11 追加仕様：追加攻撃の扱い、半減の重ねがけ、攻撃後のHP条件ほか ----
const turn1 = (A, B, sa = 0, sb = 0) => { const st = newBattle(A, B); resolveTurn(st, sa, sb, new Rng(1)); return st; };
const hitsOf2 = (st, who) => st.log.filter(e => e.t === 'hit' && e.who === who);
t('次のターンの威力加算は、技本体だけ（追加攻撃には乗らない）', () => {
  const skx = sk('light', 'phys', 100, [{ op: 'extra', type: 'mag', power: 50 }]);
  const mkA = () => mk('fire', 200, 200, 500, 99999, 0, 0, slots3(skx, skx, skx)), B = () => mk('earth', 1, 1, 1, 99999, 0, 0, slots3(plain, plain, plain));
  const base = hitsOf2(turn1(mkA(), B()), 'a'); const A2 = mkA(); A2.pending.powBonus = 100; const buf = hitsOf2(turn1(A2, B()), 'a');
  assert.equal(buf[0].dmg, (200 + 100 + 100) * 2); assert.equal(buf[1].dmg, base[1].dmg); // 追加攻撃は変わらない
});
t('半減の重ねがけ：次のターン効果とこのターン効果で4分の1', () => {
  const hn = sk('light', 'phys', 100, [{ op: 'halfNow', cond: 'first' }]);
  const mkB = () => mk('earth', 200, 200, 100, 99999, 0, 0, slots3(plain, plain, plain));
  const one = hitsOf2(turn1(mk('fire', 200, 200, 500, 99999, 0, 0, slots3(hn, hn, hn)), mkB()), 'b')[0].dmg;
  const A2 = mk('fire', 200, 200, 500, 99999, 0, 0, slots3(hn, hn, hn)); A2.pending.halfN = 1; // 前のターンの「次のターン半減」
  const two = hitsOf2(turn1(A2, mkB()), 'b')[0].dmg;
  assert.equal(two, Math.round(one * 0.5)); assert.equal(one, Math.round((200 + 100) * 2 * 0.5)); // 一度なら1/2、重なると1/4
});
t('攻撃後のHP条件：本体の攻撃でHPが減ったあとの値で比べる', () => {
  const mkS = op => sk('light', 'phys', 100, [{ op: 'extra', type: 'mag', power: 50, cond: op }]);
  const run = (op, bHp) => { const A = mk('fire', 200, 200, 500, 3000, 0, 0, slots3(mkS(op), mkS(op), mkS(op))); A.hp = 500; return hitsOf2(turn1(A, mk('earth', 1, 1, 1, bHp, 0, 0, slots3(plain, plain, plain))), 'a').length; };
  assert.equal(run('afterFoeHpLower', 1000), 2);  // 本体で1000→400。自分500より少ない → 追加攻撃
  assert.equal(run('afterFoeHpHigher', 1000), 1);
  assert.equal(run('afterFoeHpHigher', 3000), 2);  // 3000→2400。自分500より多い
});
t('吸収・反動：excludeExtras で追加攻撃のダメージを含めない', () => {
  const mkSk = ex => sk('light', 'phys', 100, [{ op: 'extra', type: 'mag', power: 50 }, { op: 'drain', ratio: 0.5, excludeExtras: ex }]);
  const heal = ex => { const A = mk('fire', 200, 200, 500, 3000, 0, 0, slots3(mkSk(ex), mkSk(ex), mkSk(ex))); A.hp = 100; const st = turn1(A, mk('earth', 1, 1, 1, 99999, 0, 0, slots3(plain, plain, plain))); return st.log.find(e => e.t === 'heal').n; };
  assert.equal(heal(true), Math.round(600 * 0.5)); assert.equal(heal(false), Math.round((600 + 500) * 0.5));
});
t('次の攻撃が指定属性なら威力加算（技の属性で判定）', () => {
  const run = el => { const A = mk('fire', 200, 200, 500, 99999, 0, 0, slots3(sk(el, 'phys', 100), plain, plain)); A.pending.powBonusEl = [{ el: 'fire', n: 100 }]; return hitsOf2(turn1(A, mk('earth', 1, 1, 1, 99999, 0, 0, slots3(plain, plain, plain))), 'a')[0].dmg; };
  assert.equal(run('fire') > run('water'), true); assert.equal(run('fire'), Math.round((200 + 200) * 2 * 1.5 * (1))); // 火の技は+100、タイプ一致1.5倍
});
t('素早さを攻撃力にする追加攻撃（その攻撃に限る）', () => {
  const sp = sk('light', 'phys', 100, [{ op: 'extra', type: 'phys', power: 100, stat: 'spd' }]);
  const st = turn1(mk('fire', 1, 1, 500, 99999, 0, 0, slots3(sp, sp, sp)), mk('earth', 1, 1, 1, 99999, 0, 0, slots3(plain, plain, plain)));
  const h = hitsOf2(st, 'a'); assert.equal(h[1].dmg, (500 + 100) * 2); assert.equal(h[0].dmg, (1 + 100) * 2);
});
t('相手の攻撃をコピーして追加攻撃（M000型）', () => {
  const cp = sk('light', 'phys', 10, [{ op: 'forceFirst' }, { op: 'nullifyFoe' }, { op: 'copyFoe' }]);
  const foe = sk('fire', 'mag', 120);
  const A = mk('earth', 1, 300, 1, 99999, 0, 0, slots3(cp, cp, cp)), B = mk('wind', 999, 999, 999, 99999, 0, 0, slots3(foe, foe, foe));
  const st = turn1(A, B); assert.equal(hitsOf2(st, 'b').length, 0);                 // 相手の攻撃は打ち消される
  const h = hitsOf2(st, 'a'); assert.equal(h.length, 2); assert.equal(h[1].dmg, calcDamage(A, { el: 'fire', type: 'mag', power: 120 }, B, 1)); // 自分の能力で、相手の技の属性・種別・威力
});
t('反動で倒れたとき反撃し、相手を倒せばHP10で生き残る／倒せなければ負け', () => {
  const ct = sk('light', 'phys', 100, [{ op: 'recoil', ratio: 0.5 }, { op: 'counterOnSelfKO', type: 'mag', power: 130, healOnKill: 10 }]);
  const run = bHp => { const A = mk('fire', 200, 200, 500, 100, 0, 0, slots3(ct, ct, ct)); const st = turn1(A, mk('earth', 1, 1, 1, bHp, 0, 0, slots3(plain, plain, plain))); return { st, A }; };
  const win = run(700); assert.equal(win.st.result, 'a'); assert.equal(win.A.hp, 10);   // 本体600→残り100→反撃で倒す→HP10
  const lose = run(3000); assert.equal(lose.st.result, 'b'); assert.equal(lose.A.hp, 0); // 反撃しても倒せず、反動で倒れた側の負け
});
t('同時に倒れたとき、反動で倒れた側が負け（勝者はHP1で残る）', () => {
  const rc = sk('light', 'phys', 100, [{ op: 'recoil', ratio: 0.5 }]);
  const A = mk('fire', 200, 200, 500, 100, 0, 0, slots3(rc, rc, rc)), B = mk('earth', 1, 1, 1, 600, 0, 0, slots3(plain, plain, plain));
  const st = turn1(A, B); assert.equal(st.result, 'b'); assert.equal(B.hp, 1); assert(st.log.some(e => e.t === 'judgeWin' && e.who === 'b')); assert(st.log.some(e => e.t === 'faint' && e.who === 'a'));
  assert(!st.log.some(e => e.t === 'faint' && e.who === 'b'));
});
t('同じシードなら同じ結果（対人戦の一致）', () => {
  const r = new Rng(5); const ja = rjan(r), jb = rjan(r);
  const run = () => { const g = new Rng('room'); const s = simulate(analyze(ja, data), analyze(jb, data), g); return JSON.stringify([s.result, s.log]); };
  assert.equal(run(), run());
});
t('大量対戦：平均ターン・相打ち率・先攻勝率', () => {
  CONFIG.DAMAGE_K = DEFAULT_K; CONFIG.LASTSTAND_THR = DEFAULT_LS; Object.assign(CONFIG, DEFAULT_MULT);
  const r = new Rng(42); const N = 20000; let turns = 0, draws = 0, ge10 = 0, fastWin = 0, fastN = 0;
  for (let i = 0; i < N; i++) {
    const A = analyze(rjan(r), data), B = analyze(rjan(r), data);
    const s = simulate(A, B, r); const last = s.log.filter(e => e.t === 'turn').length;
    turns += last; if (s.result === 'draw') draws++; if (last >= 10) ge10++;
    if (A.stats.spd !== B.stats.spd && s.result !== 'draw') { fastN++; if (s.result === (A.stats.spd > B.stats.spd ? 'a' : 'b')) fastWin++; }
  }
  console.log(`    平均 ${(turns / N).toFixed(2)}ターン / 10ターン到達 ${(100 * ge10 / N).toFixed(2)}% / 相打ち ${(100 * draws / N).toFixed(2)}% / 速い方の勝率 ${(100 * fastWin / fastN).toFixed(0)}%`);
  assert(turns / N > 2.5 && turns / N < 6.5);
});
console.log(`\n${n} tests passed`);
