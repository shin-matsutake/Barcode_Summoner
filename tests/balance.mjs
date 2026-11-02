// モンスター100種の強さ測定。node tests/balance.mjs
import fs from 'node:fs';
import { analyze, ID_DIGITS, baseValue } from '../js/core/jan.js';
import { Rng } from '../js/core/rng.js';
import { simulate } from '../js/core/battle.js';
const data = { monsters: JSON.parse(fs.readFileSync('data/monsters.json')).monsters, skills: JSON.parse(fs.readFileSync('data/skills.json')).skills };
const r = new Rng(2024);
const rjan = () => Array.from({ length: 13 }, () => r.int(10)).join('');
const bucket = Array.from({ length: 100 }, () => []);
while (bucket.some(b => b.length < 60)) { const j = rjan(); const id = baseValue([...j].map(Number), ID_DIGITS.species); if (bucket[id].length < 60) bucket[id].push(j); }
const allJ = bucket.flat();
const PER = 600, res = [];
for (let id = 0; id < 100; id++) {
  let w = 0, d = 0, l = 0, turns = 0, one = 0, hpSum = 0;
  for (let k = 0; k < PER; k++) {
    const A = analyze(bucket[id][k % 60], data), B = analyze(allJ[r.int(allJ.length)], data);
    const s = simulate(A, B, r); const t = s.log.filter(e => e.t === 'turn').length;
    turns += t; if (t === 1) one++; hpSum += A.stats.hp;
    if (s.result === 'a') w++; else if (s.result === 'draw') d++; else l++;
  }
  res.push({ id, name: data.monsters[id].name, el: data.monsters[id].el, win: w / PER, draw: d / PER, wr: (w + d / 2) / PER, turns: turns / PER, one: one / PER, hp: hpSum / PER });
}
const pct = x => (100 * x).toFixed(0) + '%';
const sorted = [...res].sort((a, b) => b.wr - a.wr);
console.log('■上位12'); sorted.slice(0, 12).forEach(x => console.log(`M${String(x.id).padStart(3, '0')} ${x.name} ${x.el} 勝率${pct(x.wr)} (相打ち${pct(x.draw)}) 平均${x.turns.toFixed(1)}T`));
console.log('■下位12'); sorted.slice(-12).forEach(x => console.log(`M${String(x.id).padStart(3, '0')} ${x.name} ${x.el} 勝率${pct(x.wr)} (相打ち${pct(x.draw)}) 平均${x.turns.toFixed(1)}T`));
const grp = (name, f) => { const a = res.filter(f); console.log(`${name}: 平均勝率${pct(a.reduce((s, x) => s + x.wr, 0) / a.length)} (n=${a.length})`); };
console.log('■種族グループ(10体ずつ)');
['スライム','ゴブリン','コボルド','オーク','ウルフ','ゴーレム/ワイバーン','精霊系','ドラゴン前','神獣','最上位'];
[[1,10,'スライム'],[11,20,'ゴブリン'],[21,30,'コボルド'],[31,40,'オーク'],[41,50,'ウルフ'],[51,62,'ゴーレム・ワイバーン'],[63,74,'精霊・半獣'],[75,80,'キメラ系'],[81,86,'ドラゴン'],[87,92,'四神・麒麟'],[93,98,'幻獣'],[99,99,'終焉ノ魔王'],[0,0,'カーバンクル']].forEach(([a,b,n])=>grp(n,x=>x.id>=a&&x.id<=b));
console.log('■属性別'); for (const e of ['fire','water','earth','wind','light','dark']) grp(e, x => x.el === e);
const wrs = res.map(x => x.wr); console.log(`■勝率の分布 最小${pct(Math.min(...wrs))} 最大${pct(Math.max(...wrs))} 50±10%以内: ${wrs.filter(v => Math.abs(v - .5) <= .1).length}体 / 40%未満: ${wrs.filter(v => v < .4).length}体 / 60%超: ${wrs.filter(v => v > .6).length}体`);
console.log('全体 1ターン決着率:', pct(res.reduce((s, x) => s + x.one, 0) / 100), ' 平均ターン:', (res.reduce((s, x) => s + x.turns, 0) / 100).toFixed(2));
