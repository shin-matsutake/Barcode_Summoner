// 図鑑の記録（js/dex.js）と、保存データの読み込みのテスト
import assert from 'node:assert/strict';
import * as D from '../js/dex.js';
import * as store from '../js/storage.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const J = i => String(4900000000000 + i).padStart(13, '0');

t('召喚すると登録される。新しい種だけ true。回数と、いちばん運のよい個体を覚える', () => {
  const d = D.emptyDex();
  assert.equal(D.recordSummon(d, 48, { jan: J(1), luck: 0.4, date: '2026-11-10' }), true);
  assert.equal(D.recordSummon(d, 48, { jan: J(2), luck: 0.7, date: '2026-11-12' }), false);
  assert.equal(D.recordSummon(d, 48, { jan: J(3), luck: 0.5, date: '2026-11-08' }), false);
  const r = d.seen['48'];
  assert.deepEqual([r.n, r.bestLuck, r.bestJan, r.first], [3, 0.7, J(2), '2026-11-08']);
});

t('範囲の外の種の番号は、登録しない', () => {
  const d = D.emptyDex();
  for (const id of [-1, 100, 1.5, 'x', null]) assert.equal(D.recordSummon(d, id, { jan: J(1), luck: 0.5 }), false);
  assert.equal(Object.keys(d.seen).length, 0);
});

t('登場人物などは、勝ったときに登録（recordExtra）。同じものは2回登録されない', () => {
  const d = D.emptyDex();
  assert.equal(D.recordExtra(d, 701, '2026-11-14'), true);
  assert.equal(D.recordExtra(d, 701, '2026-11-15'), false);
  assert.deepEqual(d.extra['701'], { first: '2026-11-14' });
  assert.equal(D.recordExtra(d, 'abc'), false);
});

t('古い保存データの引き継ぎ：いまのストックから、1回だけ記録を作る', () => {
  const d = D.emptyDex();
  const items = [{ speciesId: 5, jan: J(1), luck: 0.3, date: '2026-11-05' }, { speciesId: 5, jan: J(2), luck: 0.6, date: '2026-11-01' }, { speciesId: 5, jan: J(1), luck: 0.3, date: '2026-11-05' }, { speciesId: 9, jan: J(3), luck: 0.5, date: '' }];
  assert.equal(D.seedFrom(d, items), true);
  assert.deepEqual([d.seen['5'].n, d.seen['5'].first, d.seen['5'].bestJan], [2, '2026-11-01', J(2)]);   // 同じ番号は1回だけ数える
  assert.equal(D.seedFrom(d, items), false);
  assert.equal(d.seen['5'].n, 2);
});

t('進み具合とコンプリート：報酬そのものは、条件に入れない', () => {
  const d = D.emptyDex();
  const entries = [{ id: 701, kind: 'character' }, { id: 702, kind: 'character' }, { id: 100, kind: 'reward', reward: true }];
  assert.deepEqual(D.dexCounts(d, entries).kinds, { character: { seen: 0, total: 2 }, reward: { seen: 0, total: 1 } });
  for (let i = 0; i < 100; i++) D.recordSummon(d, i, { jan: J(i), luck: 0.5 });
  assert.equal(D.dexComplete(d, entries), false, '登場人物がまだ');
  D.recordExtra(d, 701); D.recordExtra(d, 702);
  assert.equal(D.dexComplete(d, entries), true, '報酬の100番がなくても、コンプリート');
  assert.equal(D.dexCounts(d, entries).species.seen, 100);
  const d2 = D.emptyDex(); for (let i = 0; i < 99; i++) D.recordSummon(d2, i, { jan: J(i), luck: 0.5 });
  assert.equal(D.dexComplete(d2, []), false, 'モンスターが1種足りない');
});

t('保存データの読み込み：おかしな値は捨てる', () => {
  const d = D.normalizeDex({ seeded: 1, seen: { 3: { first: '2026-11-01', n: 0, bestLuck: 5, bestJan: 'x' }, 150: { n: 2 }, abc: {} }, extra: { 701: { first: 9 }, x: {} } });
  assert.equal(d.seeded, true);
  assert.deepEqual(Object.keys(d.seen), ['3']); assert.deepEqual(d.seen['3'], { first: '2026-11-01', n: 1, bestLuck: 1, bestJan: '' });
  assert.deepEqual(d.extra, { 701: { first: '' } });
  assert.deepEqual(D.normalizeDex(null), D.emptyDex());
});

t('保存データ：書き出して読み込んでも同じ。dex のない古いデータも読める（storage経由）', () => {
  store.importText(JSON.stringify({ schema: 1, stock: [], dex: { seeded: true, seen: { 10: { first: '2026-11-02', n: 3, bestLuck: 0.8, bestJan: J(4) } }, extra: { 701: { first: '2026-11-14' } } } }));
  const a = store.get().dex;
  assert.deepEqual(a.seen['10'], { first: '2026-11-02', n: 3, bestLuck: 0.8, bestJan: J(4) }); assert.deepEqual(a.extra['701'], { first: '2026-11-14' });
  assert.deepEqual(D.normalizeDex(JSON.parse(store.exportText()).dex), a);
  store.importText(JSON.stringify({ schema: 1, stock: [] }));
  assert.deepEqual(store.get().dex, D.emptyDex());
  store.reset(); assert.deepEqual(store.get().dex, D.emptyDex());
});

console.log(`\n${n} tests passed`);
