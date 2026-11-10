// 保存。localStorage のキーは barcodeSummoner_v1。使えない環境ではその場かぎり（メモリのみ）で動く。
const KEY = 'barcodeSummoner_v1';
const SCHEMA = 1;
export const ROSTER_MAX = 5;   // タワーの仲間の最大数
const defaults = () => ({
  schema: SCHEMA,
  stock: [],      // { jan:'13桁', nick:'ニックネーム', date:'2026-11-02' }
  fav: [],        // お気に入り（最大10体）のJANコード
  options: { bgm: 70, se: 70, tempo: 'normal', fx: true, showFoeNick: true },
  tower: { cleared: 0, roster: [] },   // cleared＝クリアした最大のステージ番号／roster＝タワーの仲間のJAN（最大5体。挑戦が終わるまで外せない）
  tutorial: { done: [] },   // 見終わった幕（'act1' など）
});
let state = defaults();
let volatile = false;

const validItem = it => it && typeof it.jan === 'string' && /^\d{13}$/.test(it.jan);
function migrate(o) {
  const d = defaults();
  if (!o || typeof o !== 'object') return d;
  return {
    ...d, ...o, schema: SCHEMA,
    options: { ...d.options, ...(o.options || {}) },
    stock: Array.isArray(o.stock) ? o.stock.filter(validItem).map(it => ({ jan: it.jan, nick: String(it.nick || '').slice(0, 10), date: String(it.date || '') })) : [],
    tower: {
      cleared: Math.max(0, Math.min(99, Math.floor(Number(o.tower && o.tower.cleared)) || 0)),
      roster: [...new Set(Array.isArray(o.tower && o.tower.roster) ? o.tower.roster.filter(j => typeof j === 'string' && /^\d{13}$/.test(j)) : [])].slice(0, ROSTER_MAX),
    },
    tutorial: { done: Array.isArray(o.tutorial && o.tutorial.done) ? o.tutorial.done.filter(x => typeof x === 'string').slice(0, 20) : [] },
    fav: Array.isArray(o.fav) ? o.fav.filter(j => /^\d{13}$/.test(j)).slice(0, 10) : [],
  };
}
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = migrate(JSON.parse(raw));
  } catch (e) { volatile = true; state = defaults(); }
  return state;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) { volatile = true; return false; }
}
export const get = () => state;
export const isVolatile = () => volatile;
export function update(fn) { fn(state); return save(); }
export const exportText = () => JSON.stringify(state, null, 1);
export function importText(text) {
  const o = JSON.parse(text);
  if (!o || typeof o !== 'object' || !Array.isArray(o.stock)) throw new Error('このファイルは保存データではありません');
  if (o.schema > SCHEMA) throw new Error('新しいバージョンの保存データです。アプリを更新してください');
  state = migrate(o);
  return save();
}
export function reset() { state = defaults(); return save(); }
