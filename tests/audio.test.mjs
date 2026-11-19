import assert from 'node:assert/strict';
import * as A from '../js/audio.js';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok  ' + name); };

t('攻撃の音：ダメージが相手の最大HPの何割かで、1〜4に分かれる（2割・4割・6割）', () => {
  assert.equal(A.damageTier(0, 1000), 1);
  assert.equal(A.damageTier(199, 1000), 1);
  assert.equal(A.damageTier(200, 1000), 2);
  assert.equal(A.damageTier(399, 1000), 2);
  assert.equal(A.damageTier(400, 1000), 3);
  assert.equal(A.damageTier(599, 1000), 3);
  assert.equal(A.damageTier(600, 1000), 4);
  assert.equal(A.damageTier(5000, 1000), 4);
  assert.equal(A.damageTier(10, 0), 1, '最大HPが0でも落ちない');
});
t('攻撃の音：魔法は Magic、物理は Physical（ファイル名どおり）', () => {
  assert.equal(A.attackSeKey('mag', 1), 'se/Magic_1');
  assert.equal(A.attackSeKey('mag', 4), 'se/Magic_4');
  assert.equal(A.attackSeKey('phys', 3), 'se/Physical_3');
});
t('召喚の音：運 低〜最高＝01〜04。固有は05', () => {
  assert.deepEqual([0, 1, 2, 3].map(x => A.summonSeKey(x)), ['se/summon_01', 'se/summon_02', 'se/summon_03', 'se/summon_04']);
  assert.equal(A.summonSeKey(0, true), 'se/summon_05');
  assert.equal(A.summonSeKey(3, true), 'se/summon_05');
  assert.equal(A.summonSeKey(9), 'se/summon_04', '範囲の外は、端にそろえる');
});
t('バトルのBGM：9曲からランダム。前の曲とは重ならない', () => {
  const seen = new Set(); let prev = 0;
  for (let i = 0; i < 300; i++) { const k = A.pickBattleN(prev); assert(k >= 1 && k <= 9); assert.notEqual(k, prev); seen.add(k); prev = k; }
  assert.equal(seen.size, 9);
  assert.equal(A.battleBgmKey(7), 'BGM/BGM_07');
});
t('画面ごとのBGM：メニューが基本。タワーはタワー。チュートリアルは ccl', () => {
  assert.equal(A.bgmFor('top'), 'BGM/Menu');
  assert.equal(A.bgmFor('stock'), 'BGM/Menu');
  assert.equal(A.bgmFor('summonFx'), 'BGM/Menu');
  assert.equal(A.bgmFor('tower'), 'BGM/tower');
  assert.equal(A.bgmFor('towerRoster'), 'BGM/tower');
  assert.equal(A.bgmFor('select', { stage: 3 }), 'BGM/tower');
  assert.equal(A.bgmFor('select', { mode: 'code' }), 'BGM/Menu');
  assert.equal(A.bgmFor('match', { kind: 'tower' }), 'battle');
  assert.equal(A.bgmFor('match', { kind: 'code' }), 'battle');
  assert.equal(A.bgmFor('match', { kind: 'tutorial' }), 'BGM/ccl');
  assert.equal(A.bgmFor('story'), 'BGM/ccl');
  assert.equal(A.bgmFor('soundGate'), null);
});
t('消音：ブラウザなしでも、音を出す・消すを切り替えられる（鳴らす関数は何も起こさない）', async () => {
  A.setSound(false); assert.equal(A.soundOn(), false);
  A.setSound(true); assert.equal(A.soundOn(), true);
  await A.playSe('se/select'); await A.playAttackSe('mag', 10, 100); A.playBgm('battle');
});
console.log(`\n${n} tests passed`);
