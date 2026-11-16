import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { simulate } from '../../js/core/battle.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const r=new Rng(555111);
const withCheck=d12=>{const d=[...d12].map(Number);const s=d.reduce((a,v,i)=>a+v*(i%2?3:1),0);return d12+((10-(s%10))%10)};
const rjan=()=>withCheck(Array.from({length:12},()=>r.int(10)).join(''));
const N=Number(process.argv[2]||30000);
const seen=new Set(); const pool=[];
while(pool.length<N){const j=rjan(); if(seen.has(j))continue; seen.add(j); pool.push({j,p:analyze(j,data)});}
const t0=Date.now();
for(const x of pool){let w=0;for(let k=0;k<30;k++){const s=simulate(x.p,pool[r.int(pool.length)].p,r);w+=s.result==='a'?1:s.result==='draw'?.5:0;}x.wr=w/30;}
fs.writeFileSync('/tmp/bigpool.json',JSON.stringify(pool.map(x=>({j:x.j,wr:x.wr,id:x.p.speciesId,el:x.p.monster.el}))));
const s=[...pool].sort((a,b)=>a.wr-b.wr);const q=p=>s[Math.floor(p*s.length)].wr.toFixed(2);
console.log('個体',pool.length,'時間',((Date.now()-t0)/1000).toFixed(0),'秒 / 勝率 中央',q(.5),'上位10%',q(.9),'上位3%',q(.97),'上位1%',q(.99),'上位0.2%',q(.998));
