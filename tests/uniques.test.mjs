// 固有モンスターの技と、コアに足した部品のテスト（data/uniques.json）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Rng } from '../js/core/rng.js';
import { analyze } from '../js/core/jan.js';
import { createFighter, newBattle, resolveTurn, simulate, allowedSlots, calcDamage, CONFIG } from '../js/core/battle.js';
const data = { monsters: JSON.parse(fs.readFileSync('data/monsters.json')).monsters, skills: JSON.parse(fs.readFileSync('data/skills.json')).skills };
const U = JSON.parse(fs.readFileSync('data/uniques.json')).monsters;
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

const sk = (el, type, power, effects = [], name = el + type + power) => ({ name, el, type, power, effects, text: '' });
const slots3 = (a, b, c) => [{ slot: 0, kind: 'A', ...a }, { slot: 1, kind: 'B', ...b }, { slot: 2, kind: 'U', ...c }];
const prof = (el, st, slots, res = {}) => ({ monster: { name: el, el }, stats: { hp: 5000, atk: 300, mat: 300, spd: 100, ...st }, res: { phys: 0, mag: 0, ...res }, slots: slots3(...slots) });
const uOf = name => U.find(m => m.unique.name === name);
const uProf = (m, over = {}) => ({ monster: { name: m.name, el: m.el }, stats: { ...m.stats, ...over }, res: { ...m.res },
  slots: slots3(data.skills[m.skills[0]], data.skills[m.skills[1]], m.unique) });
const fight = (pa, pb) => newBattle(createFighter(pa), createFighter(pb));
const turn = (st, a, b) => resolveTurn(st, a, b, new Rng(1));
const hits = (ev, who) => ev.filter(e => e.t === 'hit' && e.who === who);
const filler = sk('earth', 'phys', 10, [], 'ざこ');

t('固有モンスター：24体、番号の重複なし、No100は入っていない', () => {
  assert.equal(U.length, 24);
  assert.equal(new Set(U.map(m => m.id)).size, 24);
  assert(!U.some(m => m.id === 100));
  for (const m of U) { assert(m.skills.length === 2 && m.skills.every(i => data.skills[i])); assert(m.unique.effects.length > 0); }
});
t('固有技の効果の部品は、すべて、コアが知っているもの', () => {
  const src = fs.readFileSync('js/core/battle.js', 'utf8'), bad = [];
  for (const m of U) for (const o of m.unique.effects) if (!src.includes(`'${o.op}'`)) bad.push(`${m.name}:${o.op}`);
  assert.deepEqual(bad, []);
});
t('固有技の文章：全角スペース区切りや「先行」の誤字が残っていない', () => {
  for (const m of U) { const x = m.unique.text; assert(!/\u3000/.test(x) && !/先行/.test(x) && !/\s$/.test(x), m.name); }
  for (const nm of ['神秘結界', '真・神秘結界']) assert(!/属性に関係なく/.test(uOf(nm).unique.text));
});

t('与えるダメージは、相手のHPで止まる。吸収はその値で計算する', () => {
  const drain = sk('fire', 'phys', 500, [{ op: 'drain', ratio: 1 / 3 }], 'どれいん');
  const st = fight(prof('fire', { atk: 900, spd: 999 }, [drain, filler, filler]), prof('earth', { hp: 100 }, [filler, filler, filler]));
  st.a.hp = 1000;
  const ev = turn(st, 0, 0);
  assert.equal(hits(ev, 'a')[0].dmg, 100);                       // 実際のダメージは、残りHPの100まで
  assert.equal(ev.find(e => e.t === 'heal').n, 33);              // 100の1/3 → 33
  assert.equal(st.over, true);
});
t('追加攻撃に、本体と別の属性をつけられる（属性の有利・不利が、その属性で決まる）', () => {
  const base = { op: 'extra', type: 'phys', power: 100 };
  const run = el => { const e = el ? { ...base, el } : base;
    const st = fight(prof('fire', { spd: 999 }, [sk('fire', 'phys', 10, [e]), filler, filler]), prof('fire', { hp: 9000 }, [filler, filler, filler]));
    return hits(turn(st, 0, 0), 'a'); };
  const plain = run(null), water = run('water');
  assert.equal(water[1].el, 'water'); assert(water[1].dmg > plain[1].dmg);   // 水は火に有利
});
t('固定ダメージは、半減・倍・威力強化の影響を受けない', () => {
  const fx = sk('dark', 'mag', 10, [{ op: 'foeDamage', n: 300 }], 'こてい');
  const st = fight(prof('dark', { spd: 999 }, [fx, filler, filler]), prof('earth', { hp: 9000 }, [filler, filler, filler]));
  st.b.pending = { halfN: 3, takeMult: 0.1 }; st.a.pending = { powBonus: 500 };
  const f = hits(turn(st, 0, 0), 'a').find(e => e.fixed);
  assert.equal(f.dmg, 300);
});
t('次のターン受けるダメージを1/3にする（nextTake）', () => {
  const run = eff => { const st = fight(prof('earth', { atk: 100 }, [sk('earth', 'phys', 10, eff), filler, filler]), prof('earth', { spd: 999, hp: 9999, atk: 500 }, [filler, sk('earth', 'phys', 100), filler]));
    turn(st, 0, 0); return hits(turn(st, 1, 1), 'b')[0].dmg; };   // 2ターン目に、相手がこちらを攻撃
  const none = run([]), third = run([{ op: 'nextTake', mult: 1 / 3 }]);
  assert(Math.abs(third - none / 3) <= 12, `${third} vs ${none / 3}`);
});
t('打ち消されない技：属性で負けていても、打ち消されない', () => {
  const unb = sk('water', 'mag', 50, [{ op: 'unblockable' }], 'ふめつ');
  const mk = ef => { const st = fight(prof('water', { spd: 999 }, [sk('water', 'mag', 50, ef), filler, filler]), prof('earth', {}, [sk('earth', 'phys', 50), filler, filler])); return turn(st, 0, 0); };
  assert(mk([]).some(e => e.t === 'nullified' && e.who === 'a'));        // ふつうは打ち消される（土は水に有利）
  const ev = mk([{ op: 'unblockable' }]);
  assert(!ev.some(e => e.t === 'nullified' && e.who === 'a')); assert(hits(ev, 'a').length >= 1);
});
t('使ったあと2ターン使えない技（神秘結界）', () => {
  const m = uOf('神秘結界');
  const st = fight(uProf(m), prof('earth', { hp: 9999 }, [filler, filler, filler]));
  turn(st, 2, 0);
  assert(!allowedSlots(st.a, 2).includes(2));          // 次のターン：使えない
  turn(st, 0, 1);
  assert(!allowedSlots(st.a, 3).includes(2));          // その次のターン：まだ使えない
  turn(st, 1, 0);
  assert(allowedSlots(st.a, 4).includes(2));           // 2ターンあけたら、使える
});
t('ミミック：相手の技の効果を消し、本来の回復分を取り戻す。効果のない技には、自分のHPの半分', () => {
  const m = uOf('シュレーディンガー・パンドラ');
  const heavy = sk('earth', 'phys', 60, [{ op: 'extra', type: 'phys', power: 60 }, { op: 'drain', ratio: 1 }, { op: 'nextPower', n: 100 }], 'おお');
  const st = fight(uProf(m), prof('earth', { spd: 999, hp: 9999, atk: 400 }, [heavy, filler, filler]));
  st.b.hp = 5000; const ev = turn(st, 2, 0);
  assert(ev.some(e => e.t === 'negated'));
  assert.equal(hits(ev, 'b').length, 1);                                    // 追加攻撃は出ない
  assert(!ev.some(e => e.t === 'heal' && e.who === 'b'));                  // 相手は回復しない
  assert.equal(st.a.hp, st.a.maxHp);                                       // 受けたダメージの分、相手が回復するはずだった量を取り戻す
  assert.equal(st.b.pending.powBonus, undefined);                          // 次のターンの強化もつかない
  const st2 = fight(uProf(m), prof('earth', { hp: 9999 }, [filler, filler, filler]));   // 効果のない技
  const f = hits(turn(st2, 2, 0), 'a').find(e => e.fixed);
  assert.equal(f.dmg, Math.round(st2.a.maxHp / 2));
});
t('リッチキング：先攻の相手に倒されたら、倒されずに復活して攻撃する', () => {
  const m = uOf('黄泉帰還'), big = sk('earth', 'phys', 3000, [], 'おおぶり');
  const st = fight(uProf(m), prof('earth', { spd: 999, hp: 5000, atk: 999 }, [big, filler, filler]));
  const ev = turn(st, 2, 0);
  assert(ev.some(e => e.t === 'revive')); assert(hits(ev, 'a').length >= 1);     // 復活して、そのまま攻撃
  assert(!st.over); assert.equal(st.a.hp, Math.round(st.a.maxHp / 2));
  assert(st.b.hp <= 2500);                                                       // 相手のHPは、半分以下
  const st2 = fight(uProf(m), prof('earth', { spd: 999, hp: 100, atk: 999 }, [big, filler, filler]));   // 倒せるHPの相手
  const ev2 = turn(st2, 2, 0);
  assert(ev2.some(e => e.t === 'revive')); assert(st2.over && st2.result === 'a');
  assert.equal(st2.a.hp, Math.min(st2.a.maxHp, Math.round(st2.a.maxHp / 2) + 1000));   // 倒したので、さらに1000回復
});
t('大五郎：相手のHP分のダメージを受け、9/10を固定ダメージで与え、その1/3を回復する', () => {
  const m = uOf('おやすみハグ');
  const st = fight(uProf(m), prof('earth', { hp: 3000, spd: 999 }, [filler, filler, filler]));
  const ev = turn(st, 2, 0);
  const self = ev.find(e => e.t === 'selfDamage'), fx = hits(ev, 'a').find(e => e.fixed), hl = ev.find(e => e.t === 'heal');
  assert(self.n > 2500 && self.n <= 3000);                       // 相手のいまのHP分
  assert.equal(fx.dmg, Math.round(self.n * 0.9)); assert.equal(hl.n, Math.round(fx.dmg / 3));
  assert(st.a.pending.last);                                     // 次のターンは後攻
  const st2 = fight(uProf(m, { hp: 1000, spd: 999 }), prof('earth', { hp: 9000, spd: 1 }, [filler, filler, filler]));   // 相手のHPが多い
  const ev2 = turn(st2, 2, 0);
  assert.equal(ev2.find(e => e.t === 'selfDamage').n, 1000);                 // 自分のHPが上限
  assert.equal(st2.a.hp, Math.round(Math.round(1000 * 0.9) / 3) - hits(ev2, 'b').reduce((x, e) => x + e.dmg, 0));   // 与えた分の1/3で持ち直す（そのあとの、相手の攻撃は引く）
});
t('真・神秘結界は反動をコピーしない／神秘結界はコピーする', () => {
  const rec = sk('fire', 'phys', 100, [{ op: 'recoil', ratio: 0.5 }], 'はんどう');
  const run = nm => { const st = fight(uProf(uOf(nm)), prof('fire', { hp: 9999 }, [rec, filler, filler])); return turn(st, 2, 0); };
  const copyHits = ev => ev.filter(e => e.t === 'hit' && e.copy).length;
  const a = run('神秘結界'), b = run('真・神秘結界');
  assert(copyHits(a) >= 1 && copyHits(b) >= 1);
  assert(a.some(e => e.t === 'selfDamage' && e.who === 'a' && e.cause === 'recoil'));
  assert(!b.some(e => e.t === 'selfDamage' && e.who === 'a'));
});
t('クイーンスライム：後攻なら、受けた攻撃の威力分、威力が増える', () => {
  const m = uOf('ぷるぷるボディ'), foeSk = sk('earth', 'phys', 80, [], 'ぶつ');
  const st = fight(uProf(m, { spd: 1 }), prof('earth', { spd: 999, hp: 9999 }, [foeSk, filler, filler]));
  const a = st.a, b = st.b, ev = turn(st, 2, 0);
  const h = hits(ev, 'a')[0], exp = calcDamage(a, { el: m.unique.el, type: m.unique.type, power: m.unique.power + 80 }, b, 1);
  assert.equal(h.dmg, Math.min(exp, 9999));
});
t('もふもふ：後攻で、受けた攻撃をコピーし、与えた合計の1/3を回復する', () => {
  const m = uOf('もふもふ大結界'), foeSk = sk('earth', 'phys', 80, [], 'ぶつ');
  const st = fight(uProf(m), prof('earth', { spd: 999, hp: 9999 }, [foeSk, filler, filler]));
  const ev = turn(st, 2, 0), mine = hits(ev, 'a');
  assert(mine.some(e => e.copy)); const sum = mine.reduce((s, e) => s + e.dmg, 0);
  assert.equal(ev.find(e => e.t === 'heal' && e.who === 'a').n, Math.round(sum / 3));
  assert(st.a.pending.halfN === 1);
});
t('マーメイド：先攻で相手のHPが多いときだけ、3回目の追加攻撃が出る（複数条件）', () => {
  const m = uOf('グラン・オペラ・ファンタジア');
  const run = hp => { const st = fight(uProf(m, { spd: 999 }), prof('earth', { hp, spd: 1 }, [filler, filler, filler])); st.a.hp = 2000; return hits(turn(st, 2, 0), 'a').filter(e => !e.fixed).length; };
  assert.equal(run(9000), 3); assert.equal(run(500), 2);
});
t('大洋の白き災厄：反動は本体だけ。追加攻撃で与えた分の半分を、条件つきで回復', () => {
  const m = uOf('大洋の白き災厄');
  const st = fight(uProf(m, { spd: 999 }), prof('fire', { hp: 9000, spd: 1 }, [filler, filler, filler]));
  st.a.hp = 1500;   // 回復の余地をつくる（満タンだと、回復は、失った分までしか増えない）
  const ev = turn(st, 2, 0), hs = hits(ev, 'a');
  assert.equal(ev.find(e => e.t === 'selfDamage' && e.who === 'a').n, Math.round(hs[0].dmg / 2));
  assert.equal(ev.find(e => e.t === 'heal' && e.who === 'a').n, Math.round(hs[1].dmg / 2));
});
t('九連狐火：条件が成り立つとき、回復900と固定900ダメージが、そろって出る', () => {
  const m = uOf('九連狐火');
  const st = fight(uProf(m, { spd: 999, hp: 1000 }), prof('earth', { hp: 9000, spd: 1 }, [filler, filler, filler]));
  st.a.hp = 400; const ev = turn(st, 2, 0);
  assert.equal(hits(ev, 'a').find(e => e.fixed).dmg, 900); assert(ev.some(e => e.t === 'heal' && e.n > 0));
});
t('獣覇権666：相手に666、自分にも666', () => {
  const m = uOf('獣覇権666');
  const st = fight(uProf(m, { spd: 999 }), prof('earth', { hp: 9000, spd: 1 }, [filler, filler, filler]));
  const ev = turn(st, 2, 0);
  assert.equal(hits(ev, 'a').find(e => e.fixed).dmg, 666); assert.equal(ev.find(e => e.t === 'selfDamage').n, 666);
});

t('すべての固有モンスターが、ランダムな相手と戦って、おかしな数字を出さない', () => {
  const r = new Rng(7), jan = () => Array.from({ length: 13 }, () => r.int(10)).join('');
  for (const m of U) for (let i = 0; i < 40; i++) {
    const foe = analyze(jan(), data), mine = uProf(m);
    const [pa, pb] = i % 2 ? [mine, foe] : [foe, mine];
    const st = simulate(pa, pb, r);
    assert(st.over && ['a', 'b', 'draw'].includes(st.result), m.name);
    for (const f of [st.a, st.b]) assert(Number.isFinite(f.hp) && f.hp >= 0 && f.hp <= f.maxHp, `${m.name} hp=${f.hp}`);
    for (const e of st.log) if (e.t === 'hit') assert(Number.isInteger(e.dmg) && e.dmg >= 0, `${m.name} dmg=${e.dmg}`);
    assert(st.turn <= CONFIG.MAX_TURNS + 1, m.name);
  }
});

console.log(`${n} tests passed`);
