// CPUタワーの敵チーム（5ステージ×3パターン）を、実測の強さから選んで data/tower.json に書き出す。
// 使い方：リポジトリ直下で  node tests/make_tower.mjs   （モンスター・技のデータを変えたら、もう一度実行する）
import fs from 'node:fs';
import { analyze, ID_DIGITS, baseValue, isValidCheckDigit } from '../js/core/jan.js';
import { Rng } from '../js/core/rng.js';
import { simulate } from '../js/core/battle.js';
import { simulateSeries } from '../js/core/series.js';
const data = { monsters: JSON.parse(fs.readFileSync('data/monsters.json')).monsters, skills: JSON.parse(fs.readFileSync('data/skills.json')).skills };
// ステージのルール（持ち込み体数／戦う体数）と、敵1体あたりの目標強さ（ランダムな相手に対する勝率）
const STAGES = [
  { stage: 1, rule: { bring: 1, fight: 1 }, target: 0.38 },
  { stage: 2, rule: { bring: 3, fight: 1 }, target: 0.50 },
  { stage: 3, rule: { bring: 3, fight: 2 }, target: 0.58 },
  { stage: 4, rule: { bring: 3, fight: 3 }, target: 0.66 },
  { stage: 5, rule: { bring: 5, fight: 3 }, target: 0.75 },
];
const r = new Rng(20261101);
const withCheck = d12 => { const d = [...d12].map(Number); const s = d.reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0); return d12 + ((10 - (s % 10)) % 10); };
const rjan = () => withCheck(Array.from({ length: 12 }, () => r.int(10)).join(''));
// 1) 強さの測定：ランダムなJAN 14000個 × 各70戦（相手はランダムな個体）
const pool = Array.from({ length: 14000 }, rjan).map(j => ({ j, p: analyze(j, data) }));
for (const x of pool) { let w = 0; for (let k = 0; k < 70; k++) { const s = simulate(x.p, pool[r.int(pool.length)].p, r); w += s.result === 'a' ? 1 : s.result === 'draw' ? .5 : 0; } x.wr = w / 70; }
// 2) ステージごと・パターンごとに、目標の強さに近い個体を選ぶ（同じチーム内は種を重複させない。パターン間でリーダーの属性を変える）
const out = [], used = new Set();
for (const st of STAGES) {
  const cand = pool.filter(x => Math.abs(x.wr - st.target) <= 0.04);
  const teams = [], leaderEls = new Set();
  for (let pat = 0; pat < 3; pat++) {
    const team = [], species = new Set();
    const shuffled = [...cand].sort(() => r.next() - .5);
    for (const x of shuffled) {
      if (team.length >= st.rule.bring) break;
      if (used.has(x.j) || species.has(x.p.speciesId)) continue;
      if (team.length === 0 && leaderEls.has(x.p.monster.el) && leaderEls.size < 3) continue;
      if (!isValidCheckDigit(x.j)) continue;
      team.push(x); species.add(x.p.speciesId); used.add(x.j);
      if (team.length === 1) leaderEls.add(x.p.monster.el);
    }
    if (team.length < st.rule.bring) throw new Error('候補が足りません: ステージ' + st.stage);
    teams.push(team);
  }
  out.push({ ...st, teams });
}
fs.writeFileSync('data/tower.json', JSON.stringify({ stages: out.map(s => ({ stage: s.stage, rule: s.rule, teams: s.teams.map(t => t.map(x => x.j)) })) }, null, 1));
// 3) 検証：平均的なチーム（ランダム）／厳選したチーム（上位10%の個体）で、各パターンに400回挑戦
const top = [...pool].sort((a, b) => b.wr - a.wr).slice(0, Math.floor(pool.length * .1));
const pick = (src, n) => Array.from({ length: n }, () => src[r.int(src.length)].p);
const pct = x => (100 * x).toFixed(0) + '%';
console.log('ステージ | ルール | 敵の強さ(個体の勝率) | 平均的なチームの勝率 | 厳選チームの勝率 | 敵チーム');
for (const s of out) {
  const rows = s.teams.map(t => {
    let wa = 0, wt = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      const enemy = t.slice(0, s.rule.fight).map(x => x.p);
      wa += simulateSeries(pick(pool, s.rule.fight), enemy, r).result === 'a' ? 1 : 0;
      wt += simulateSeries(pick(top, s.rule.fight), enemy, r).result === 'a' ? 1 : 0;
    }
    return { avg: wa / N, top: wt / N, names: t.map(x => x.p.monster.name + '(' + pct(x.wr) + ')').join('、') };
  });
  rows.forEach((x, i) => console.log(`S${s.stage}-${'ABC'[i]} | ${s.rule.fight}v${s.rule.fight}(${s.rule.bring}体) | 目標${pct(s.target)} | ${pct(x.avg).padStart(4)} | ${pct(x.top).padStart(4)} | ${x.names}`));
}
