// タワーの仲間のルール（js/towerRules.js）と、保存データの読み込みのテスト
import assert from 'node:assert/strict';
import * as R from '../js/towerRules.js';
import * as store from '../js/storage.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const J = i => String(4900000000000 + i).padStart(13, '0');   // 13桁の仮のJAN（チェックディジットは、このテストでは見ない）
const fresh = () => R.defaultTower();
// 仲間を k 体、強制的に入れる（枠のルールを通さない）
const withRoster = (cleared, k, extra = {}) => ({ ...fresh(), cleared, roster: Array.from({ length: k }, (_, i) => J(i + 1)), summoned: k, ...extra });

t('枠の数：いま進んでいるステージと同じ数。最大5', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9, 19].map(R.rosterCap), [1, 2, 3, 4, 5, 5, 5, 5]);
});

t('空き枠があれば、いつでも加えられる。いっぱいなら加えられない', () => {
  const a = fresh();
  assert(R.addToRoster(a, J(1)));
  assert(!R.addToRoster(a, J(2)), 'ST1は枠が1つ');
  assert(!R.addToRoster(a, J(1)), '同じ子は2回入らない');
  a.cleared = 1;                                   // ST1をクリア → 枠が2つ
  assert(R.addToRoster(a, J(2)));
  assert.deepEqual(a.roster, [J(1), J(2)]); assert.equal(a.summoned, 2);
  assert(!R.addToRoster(a, 'abc'), '13桁でないものは入らない');
});

t('ST1〜4：負けたあとだけ戻せる（回数の制限なし）', () => {
  const a = withRoster(1, 2);                      // ST2に挑戦中（枠2・仲間2）
  assert(!R.releaseInfo(a).can, '負ける前は戻せない');
  assert(!R.releaseFromRoster(a, J(1)));
  R.afterBattle(a, { stage: 2, won: false });
  assert.equal(R.releaseInfo(a).mode, 'free'); assert(R.releaseInfo(a).can);
  assert(R.releaseFromRoster(a, J(1)));
  assert(R.addToRoster(a, J(9)), '戻した分の空き枠に召喚できる');
  assert(R.releaseFromRoster(a, J(2)), '2体目も戻せる（回数の制限なし）');
  assert.equal(a.released, 2);
  R.startBattle(a);                                // 次の戦いが始まると、戻せなくなる
  assert(!R.releaseInfo(a).can);
});

t('ST1〜4：勝ったあとは戻せない', () => {
  const a = withRoster(0, 1);
  R.afterBattle(a, { stage: 1, won: true, party: [J(1)], date: '2026-11-13' });
  assert.equal(a.cleared, 1); assert(!R.releaseInfo(a).can);
});

t('ST5〜：戦いが終わるたびに、1回だけ戻せる（勝ちでも負けでも）', () => {
  const a = withRoster(4, 5);                      // ST5に着いた（ST4をクリア済み）
  a.releasesLeft = 1;
  assert.deepEqual([R.releaseInfo(a).can, R.releaseInfo(a).mode, R.releaseInfo(a).left], [true, 'limited', 1]);
  assert(R.releaseFromRoster(a, J(1)));
  assert(!R.releaseInfo(a).can, '1回使ったら、もう戻せない');
  assert(!R.releaseFromRoster(a, J(2)));
  assert(R.addToRoster(a, J(9)), '空いた枠に召喚できる');
  assert(!R.addToRoster(a, J(10)), '2体目は入らない（枠は5）');
  R.startBattle(a);
  R.afterBattle(a, { stage: 5, won: false });      // 負け → 再挑戦のために、また1回
  assert.equal(a.releasesLeft, 1);
  R.afterBattle(a, { stage: 5, won: true, party: [J(2)], date: 'd' });   // 勝ち → 次のステージのために1回
  assert.equal(a.cleared, 5); assert.equal(a.releasesLeft, 1);
});

t('使わなかった回数は、持ち越さない（たまらない）', () => {
  const a = withRoster(5, 5, { releasesLeft: 1 });
  R.afterBattle(a, { stage: 6, won: true, party: [J(1)], date: 'd' });
  R.afterBattle(a, { stage: 7, won: true, party: [J(1)], date: 'd' });
  assert.equal(a.releasesLeft, 1);
});

t('ST4に勝ってST5に進むと、戻せる回数が1回になる', () => {
  const a = withRoster(3, 4);
  R.afterBattle(a, { stage: 4, won: true, party: [J(1)], date: 'd' });
  assert.equal(a.cleared, 4); assert.equal(a.releasesLeft, 1); assert(R.releaseInfo(a).can);
});

t('相手チームの固定：そのステージをクリアするまで。クリアしたら外れる', () => {
  const a = withRoster(2, 3, { foe: { stage: 3, teamIdx: 1 } });
  R.afterBattle(a, { stage: 3, won: false });
  assert.deepEqual(a.foe, { stage: 3, teamIdx: 1 }, '負けても固定のまま');
  R.afterBattle(a, { stage: 3, won: true, party: [J(1)], date: 'd' });
  assert.equal(a.foe, null);
});

t('記録：ステージごとに、勝ったときの出撃メンバーを残す', () => {
  const a = withRoster(0, 1);
  R.afterBattle(a, { stage: 1, won: true, party: [J(1)], date: '2026-11-13' });
  R.afterBattle(a, { stage: 1, won: true, party: [J(2), J(3)], date: '2026-11-14' });
  assert.deepEqual(a.records['1'], { party: [J(2), J(3)], date: '2026-11-14' });
});

t('保存データの読み込み：古いデータは、いまの進み具合から補う', () => {
  const a = R.normalizeTower({ cleared: 4, roster: [J(1), J(1), 'x', J(2)] });
  assert.deepEqual(a.roster, [J(1), J(2)]);
  assert.equal(a.summoned, 2); assert.equal(a.releasesLeft, 1); assert.equal(a.released, 0);
  assert.equal(R.normalizeTower({ cleared: 1, roster: [] }).releasesLeft, 0);
  assert.deepEqual(R.normalizeTower(null), R.defaultTower());
  const b = R.normalizeTower({ cleared: 'ab', roster: Array.from({ length: 9 }, (_, i) => J(i + 1)), foe: { stage: 0, teamIdx: 1 }, records: { x: {}, 2: { party: [J(1), 'bad'], date: 5 } } });
  assert.equal(b.cleared, 0); assert.equal(b.roster.length, 5); assert.equal(b.foe, null);
  assert.deepEqual(b.records, { 2: { party: [J(1)], date: '5' } });
});

t('保存データ：書き出して読み込んでも、同じ（storage経由）', () => {
  store.importText(JSON.stringify({ schema: 1, stock: [], tower: { cleared: 6, roster: [J(1)], released: 3, summoned: 8, releasesLeft: 0, lost: true, foe: { stage: 7, teamIdx: 2 }, records: { 6: { party: [J(1)], date: 'd' } } } }));
  const a = store.get().tower;
  assert.deepEqual([a.cleared, a.released, a.summoned, a.releasesLeft, a.lost], [6, 3, 8, 0, true]);
  assert.deepEqual(a.foe, { stage: 7, teamIdx: 2 });
  const again = JSON.parse(store.exportText()).tower;
  assert.deepEqual(R.normalizeTower(again), a);
  store.reset();
  assert.deepEqual(store.get().tower, R.defaultTower());
});

t('説明の文：状況ごとに変わる', () => {
  assert.match(R.releaseText(withRoster(2, 3)), /負けたあとだけ/);
  assert.match(R.releaseText(withRoster(2, 3, { lost: true })), /負けたあとなので/);
  assert.match(R.releaseText(withRoster(5, 5, { releasesLeft: 1 })), /1回/);
});

console.log(`\n${n} tests passed`);
