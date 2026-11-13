// 物語のオートの待ち時間（js/ui/storyView.js）と、背景の使い分け（js/ui/bg.js）のテスト
import assert from 'node:assert/strict';
import { autoWaitMs, AUTO } from '../js/ui/storyView.js';
import { bgFor } from '../js/ui/bg.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('オートの待ち時間：文字が多いほど長い。速さで変わる', () => {
  for (const sp of ['fast', 'normal', 'slow']) assert(autoWaitMs(40, sp) > autoWaitMs(10, sp), sp);
  assert(autoWaitMs(30, 'fast') < autoWaitMs(30, 'normal'));
  assert(autoWaitMs(30, 'normal') < autoWaitMs(30, 'slow'));
});

t('オートの待ち時間：0文字でも基本の時間はある。未知の速さは「ふつう」', () => {
  assert.equal(autoWaitMs(0, 'normal'), AUTO.normal.base);
  assert.equal(autoWaitMs(20, 'xxx'), autoWaitMs(20, 'normal'));
  assert.equal(autoWaitMs(-5, 'normal'), AUTO.normal.base);
});

t('背景の使い分け：画面と、バトルの種類で決まる', () => {
  assert.equal(bgFor('top'), 'default');
  assert.equal(bgFor('stock'), 'default');
  assert.equal(bgFor('story'), 'tutorial');
  for (const s of ['tower', 'towerRoster', 'towerAdd']) assert.equal(bgFor(s), 'towerMenu', s);
  assert.equal(bgFor('select', { stage: 2 }), 'towerMenu');
  assert.equal(bgFor('select', { mode: 'code' }), 'default');   // 番号で仲間に加えて戦う選出は、タワーではない
  assert.equal(bgFor('match', { kind: 'tower' }), 'towerBattle');
  for (const k of ['auto', 'hotseat', 'code', 'pvp', 'tutorial']) assert.equal(bgFor('match', { kind: k }), 'default', k);
});

console.log(`\n${n} tests passed`);
