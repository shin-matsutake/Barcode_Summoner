// 図鑑の記録（画面を持たない。tests/dex.test.mjs でテストする）
//
//  ・モンスター（000〜099）：召喚した時点で登録する。ストックから消しても、記録は残る
//  ・登場人物・報酬・特別なモンスター（100番台・700番台・900番台など）：data/dex.json の entries に書いたものを、
//    条件を満たしたとき（登場人物は、そのキャラに勝ったとき）に、recordExtra で登録する
//  ・コンプリート：モンスター100種と、entries のうち reward ではないもの、をすべて登録したとき
//    （報酬のモンスター自身は、条件に入れない）
//
// dex の中身
//   seeded  いまのストックから、記録を作ったか（古い保存データを引き継ぐための印）
//   seen    { '種の番号': { first:'初めて召喚した日', n:召喚した回数, bestLuck:0〜1（いちばん運のよかった個体）, bestJan:その個体の番号 } }
//   extra   { '番号': { first:'登録した日' } }   … entries 用

export const SPECIES_TOTAL = 100;

const isJan = j => typeof j === 'string' && /^\d{13}$/.test(j);
const nat = v => Math.max(0, Math.floor(Number(v)) || 0);
const num01 = v => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0; };
const str = v => (typeof v === 'string' ? v : '');

export const emptyDex = () => ({ seeded: false, seen: {}, extra: {} });

// 保存データから読み込む（おかしな値は捨てる）
export function normalizeDex(raw) {
  const d = emptyDex(), o = raw && typeof raw === 'object' ? raw : {};
  d.seeded = !!o.seeded;
  for (const [k, v] of Object.entries(o.seen && typeof o.seen === 'object' ? o.seen : {})) {
    if (!/^\d{1,2}$/.test(k) || +k >= SPECIES_TOTAL || !v || typeof v !== 'object') continue;
    d.seen[String(+k)] = { first: str(v.first), n: Math.max(1, nat(v.n)), bestLuck: num01(v.bestLuck), bestJan: isJan(v.bestJan) ? v.bestJan : '' };
  }
  for (const [k, v] of Object.entries(o.extra && typeof o.extra === 'object' ? o.extra : {})) {
    if (!/^\d{1,4}$/.test(k) || !v || typeof v !== 'object') continue;
    d.extra[String(+k)] = { first: str(v.first) };
  }
  return d;
}

// 召喚した。新しい種なら true
export function recordSummon(dex, speciesId, { jan = '', luck = 0, date = '' } = {}) {
  if (speciesId === null || speciesId === undefined || speciesId === '' || typeof speciesId === 'boolean') return false;   // Number(null) は 0 になってしまうので、先にはじく
  const id = Number(speciesId);
  if (!Number.isInteger(id) || id < 0 || id >= SPECIES_TOTAL) return false;
  const key = String(id), isNew = !dex.seen[key];
  const r = dex.seen[key] || (dex.seen[key] = { first: date, n: 0, bestLuck: -1, bestJan: '' });
  r.n += 1;
  if (date && (!r.first || date < r.first)) r.first = date;
  if (luck > r.bestLuck) { r.bestLuck = num01(luck); r.bestJan = isJan(jan) ? jan : r.bestJan; }
  if (r.bestLuck < 0) r.bestLuck = 0;
  return isNew;
}

// 登場人物などを登録した（条件を満たしたとき）。新しければ true
export function recordExtra(dex, id, date = '') {
  if (id === null || id === undefined || id === '' || typeof id === 'boolean') return false;
  const key = String(Number(id));
  if (!/^\d{1,4}$/.test(key) || dex.extra[key]) return false;
  dex.extra[key] = { first: date };
  return true;
}

// 古い保存データの引き継ぎ：いまのストックなどから、記録を作る（1回だけ）。items＝[{ speciesId, jan, luck, date }]
export function seedFrom(dex, items) {
  if (dex.seeded) return false;
  const seen = new Set();
  for (const it of [...items].sort((a, b) => str(a.date).localeCompare(str(b.date)))) {
    if (seen.has(it.jan)) continue; seen.add(it.jan);
    recordSummon(dex, it.speciesId, it);
  }
  dex.seeded = true;
  return true;
}

// 進み具合。entries は data/dex.json の entries
export function dexCounts(dex, entries = []) {
  const seenSpecies = Object.keys(dex.seen).length;
  const kinds = {};
  for (const e of entries) { const k = e.kind || 'extra'; const o = kinds[k] || (kinds[k] = { seen: 0, total: 0 }); o.total++; if (dex.extra[String(e.id)]) o.seen++; }
  return { species: { seen: seenSpecies, total: SPECIES_TOTAL }, kinds };
}

// コンプリートか：モンスター100種と、報酬ではない entries を、すべて登録した
export function dexComplete(dex, entries = []) {
  if (Object.keys(dex.seen).length < SPECIES_TOTAL) return false;
  return entries.filter(e => !e.reward).every(e => dex.extra[String(e.id)]);
}
