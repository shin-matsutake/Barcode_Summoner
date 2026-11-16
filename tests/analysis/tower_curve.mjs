import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { startSeries, resolveSeriesTurn } from '../../js/core/series.js';
import { chooseSlot } from '../../js/ui/ai.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const pool=JSON.parse(fs.readFileSync('/tmp/pool.json')); const r=new Rng(31337);
const prof=new Map(); const P=x=>{if(!prof.has(x.j))prof.set(x.j,analyze(x.j,data));return prof.get(x.j)};
const sorted=[...pool].sort((a,b)=>a.wr-b.wr), q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))].wr;
const tiers=[['平均',pool],['上位30%',pool.filter(x=>x.wr>=q(.70))],['上位10%',pool.filter(x=>x.wr>=q(.90))],['上位3%',pool.filter(x=>x.wr>=q(.97))],['上位1%',pool.filter(x=>x.wr>=q(.99))]];
console.log('各層の個体の勝率の下限:',tiers.map(([n,l])=>`${n}≧${(100*Math.min(...l.map(x=>x.wr))).toFixed(0)}%`).join(' / '),'| 件数',tiers.map(([,l])=>l.length).join('/'));
const team=(src,n)=>{const t=[],sp=new Set();let g=0;while(t.length<n&&g++<500){const x=src[r.int(src.length)];if(sp.has(x.id))continue;sp.add(x.id);t.push(P(x));}return t;};
const series=(A,B,la,lb)=>{const s=startSeries(A,B);while(!s.over){const t=s.battle.turn,a=s.battle.a,b=s.battle.b;resolveSeriesTurn(s,chooseSlot(a,b,t,r,la),chooseSlot(b,a,t,r,lb),r);}return s.result==='a'?1:s.result==='draw'?.5:0;};
const f=x=>String((100*x).toFixed(0)).padStart(3)+'%';
const Es=[.40,.50,.60,.70,.75,.80,.85,.90,.93,.96,.98], NS=[1,3,5], N=250;
for(const lb of [1,3]){
  console.log(`\n■ 敵のAIレベル${lb}（${lb===1?'ランダム':'ダメージを読む'}）／ プレイヤーは、ダメージを読んで選ぶ。人数＝出す数（敵も同じ数）`);
  console.log('敵の強さ  人数 | '+tiers.map(([n])=>n.padStart(8)).join(' '));
  for(const n of NS) for(const E of Es){
    const band=pool.filter(x=>Math.abs(x.wr-E)<=.02); if(band.length<n*3) continue;
    const row=tiers.map(([,src])=>{let w=0;for(let i=0;i<N;i++)w+=series(team(src,n),team(band,n),3,lb);return w/N;});
    console.log(`  ${f(E)}   ${n}体 | `+row.map(f).map(x=>x.padStart(8)).join(' '));
  }
}
