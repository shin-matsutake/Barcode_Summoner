import fs from 'node:fs';
import { fxLevel } from '../../js/ui/summonFx.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const big=JSON.parse(fs.readFileSync('/tmp/bigpool.json'));
const by={tier:{},rings:{},shatter:{wr:0,n:0}};
let all=0; for(const x of big){ const lv=fxLevel(x.j,data); all+=x.wr;
  for(const [k,v] of [['tier',lv.tier],['rings',lv.shatter?'砕ける':lv.rings]]){ const o=by[k][v]??={wr:0,n:0}; o.wr+=x.wr; o.n++; } }
const f=x=>(100*x).toFixed(0)+'%';
console.log('全体の平均勝率',f(all/big.length),'／ 個体',big.length);
console.log('運（0=低 1=ふつう 2=高 3=最高）:',Object.entries(by.tier).map(([k,o])=>`${k}: 平均${f(o.wr/o.n)}（${(100*o.n/big.length).toFixed(0)}%）`).join('  '));
console.log('格（輪の数）:',Object.entries(by.rings).map(([k,o])=>`${k}重: 平均${f(o.wr/o.n)}（${(100*o.n/big.length).toFixed(0)}%）`).join('  '));
// 運の中でのばらつき
const tiers={}; for(const x of big){const lv=fxLevel(x.j,data);(tiers[lv.tier]??=[]).push(x.wr);}
for(const [k,v] of Object.entries(tiers)){v.sort((a,b)=>a-b);console.log(`運${k}の勝率の幅: 下位10% ${f(v[Math.floor(v.length*.1)])} 〜 上位10% ${f(v[Math.floor(v.length*.9)])}`);}
