import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { simulate, createFighter } from '../../js/core/battle.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data = { monsters: JSON.parse(fs.readFileSync(D+'monsters.json')).monsters, skills: JSON.parse(fs.readFileSync(D+'skills.json')).skills };
const p=analyze('4165334556923',data); console.log('speciesId',p.speciesId,'monster keys',Object.keys(p.monster).join(','),'name',p.monster.name);
console.log('stats keys',Object.keys(p.stats).join(','), JSON.stringify(p.stats));
const r=new Rng(777);
const withCheck = d12 => { const d=[...d12].map(Number); const s=d.reduce((a,v,i)=>a+v*(i%2?3:1),0); return d12+((10-(s%10))%10); };
const rjan=()=>withCheck(Array.from({length:12},()=>r.int(10)).join(''));
const N=Number(process.argv[2]||3000), G=Number(process.argv[3]||40);
const t0=Date.now();
const pool=Array.from({length:N},rjan).map(j=>({j,p:analyze(j,data)}));
for(const x of pool){let w=0;for(let k=0;k<G;k++){const s=simulate(x.p,pool[r.int(pool.length)].p,r);w+=s.result==='a'?1:s.result==='draw'?.5:0;}x.wr=w/G;}
console.log('時間',((Date.now()-t0)/1000).toFixed(1),'秒 / 戦数',N*G);
fs.writeFileSync('/tmp/pool.json',JSON.stringify(pool.map(x=>({j:x.j,wr:x.wr,id:x.p.speciesId,name:x.p.monster.name,el:x.p.monster.el,hp:x.p.stats.hp,atk:x.p.stats.atk,mat:x.p.stats.mat,spd:x.p.stats.spd}))));
