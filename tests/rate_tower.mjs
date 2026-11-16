// data/tower.json の敵の強さを測って、JSONに書き出す（tests/tower_xlsx.py から呼ばれる。単独でも使える）
//   使い方：node tests/rate_tower.mjs [data/tower.json] [出力JSON] [通過率の試行回数=60]
//   測るもの
//     ・敵1体ごとの「個体の強さ」＝ランダムな相手に対する勝率（make_tower.mjs と同じ物差し）
//     ・各チームの、実際に戦う顔ぶれ（先頭から「戦う数」まで）の平均の強さ
//     ・プレイヤーの層（平均／上位30%／上位10%／上位3%／上位1%）の5体チームが、そのチームに勝つ確率
//       （プレイヤーは「ダメージを読んで」技を選び、敵は、そのステージの AI の段階で選ぶ）
//   乱数は固定してあるので、同じデータなら、同じ結果になる
import fs from 'node:fs';
import { analyze } from '../js/core/jan.js';
import { Rng } from '../js/core/rng.js';
import { simulate } from '../js/core/battle.js';
import { startSeries, resolveSeriesTurn } from '../js/core/series.js';
import { chooseSlot } from '../js/ui/ai.js';

const [, , towerPath = 'data/tower.json', outPath = '/tmp/tower_rating.json', nArg = '60'] = process.argv;
const SERIES_N = Math.max(10, Number(nArg) || 60);
const data = { monsters: JSON.parse(fs.readFileSync('data/monsters.json')).monsters, skills: JSON.parse(fs.readFileSync('data/skills.json')).skills };
const tower = JSON.parse(fs.readFileSync(towerPath));
const r = new Rng(20261114);

const withCheck = d12 => { const d = [...d12].map(Number); const s = d.reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0); return d12 + ((10 - (s % 10)) % 10); };
const rjan = () => withCheck(Array.from({ length: 12 }, () => r.int(10)).join(''));
const score = x => (x.result === 'a' ? 1 : x.result === 'draw' ? 0.5 : 0);

// 1) 物差し：ランダムな個体 4000 個 × 各40戦（相手はランダムな個体）
const pool = Array.from({ length: 4000 }, rjan).map(j => ({ j, p: analyze(j, data) }));
for (const x of pool) { let w = 0; for (let k = 0; k < 40; k++) w += score(simulate(x.p, pool[r.int(pool.length)].p, r)); x.wr = w / 40; }
const sorted = [...pool].sort((a, b) => a.wr - b.wr);
const at = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].wr;
const TIERS = [['平均', pool], ['上位30%', pool.filter(x => x.wr >= at(0.70))], ['上位10%', pool.filter(x => x.wr >= at(0.90))], ['上位3%', pool.filter(x => x.wr >= at(0.97))], ['上位1%', pool.filter(x => x.wr >= at(0.99))]];

// 2) 敵1体の強さ（個体）
const rateOne = p => { let w = 0; const N = 300; for (let k = 0; k < N; k++) w += score(simulate(p, pool[r.int(pool.length)].p, r)); return w / N; };
const SK = ['技A', '技B', '固有'];
const memberInfo = j => {
  const p = analyze(j, data), m = p.monster;
  return { jan: j, speciesId: p.speciesId, name: m.name, el: m.el, hp: p.stats.hp, atk: p.stats.atk, mat: p.stats.mat, spd: p.stats.spd, physRes: p.res.phys, magRes: p.res.mag,
    skills: p.slots.map((s, i) => `${SK[i] || ''}：${s.name}（${s.el}・${s.type === 'phys' ? '物理' : '魔法'}・威力${s.power}）`), E: rateOne(p), _p: p };
};

// 3) チームごとに、通過率
const team = (src, n) => { const t = [], sp = new Set(); let g = 0; while (t.length < n && g++ < 1000) { const x = src[r.int(src.length)]; if (sp.has(x.p.speciesId)) continue; sp.add(x.p.speciesId); t.push(x.p); } return t; };
const series = (A, B, lb) => {
  const s = startSeries(A, B);
  while (!s.over) { const t = s.battle.turn, a = s.battle.a, b = s.battle.b; resolveSeriesTurn(s, chooseSlot(a, b, t, r, 3), chooseSlot(b, a, t, r, lb), r); }
  return s.result === 'a' ? 1 : s.result === 'draw' ? 0.5 : 0;
};

const out = { tiers: TIERS.map(([n, l]) => ({ name: n, minE: Math.min(...l.map(x => x.wr)), count: l.length })), poolSize: pool.length, seriesN: SERIES_N, stages: [] };
for (const st of tower.stages) {
  const { bring, fight } = st.rule, ai = st.ai || 1;
  const teams = st.teams.map((jans, idx) => {
    const members = jans.map(memberInfo);
    const foeTeam = members.slice(0, bring).slice(0, fight);   // ゲームと同じ：持ち込み数まで → 戦う数まで
    const teamE = foeTeam.reduce((a, m) => a + m.E, 0) / Math.max(1, foeTeam.length);
    const pass = {};
    for (const [name, src] of TIERS) { let w = 0; for (let i = 0; i < SERIES_N; i++) w += series(team(src, fight), foeTeam.map(m => m._p), ai); pass[name] = w / SERIES_N; }
    return { idx: idx + 1, members: members.map(({ _p, ...m }) => m), fightN: foeTeam.length, teamE, pass };
  });
  out.stages.push({ stage: st.stage, bring, fight, ai, teams });
}
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`測定した：${out.stages.length}ステージ／${out.stages.reduce((a, s) => a + s.teams.length, 0)}チーム → ${outPath}`);
