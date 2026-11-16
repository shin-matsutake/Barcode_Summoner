import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { createFighter } from '../../js/core/battle.js';
import { startSeries, resolveSeriesTurn } from '../../js/core/series.js';
import { chooseSlot } from '../../js/ui/ai.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const pool=JSON.parse(fs.readFileSync('/tmp/pool.json')); const r=new Rng(2468);
const sorted=[...pool].sort((a,b)=>a.wr-b.wr), q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))].wr;
const tiers={'上位10%':pool.filter(x=>x.wr>=q(.90)),'上位3%':pool.filter(x=>x.wr>=q(.97)),'上位1%':pool.filter(x=>x.wr>=q(.99))};
const prof=new Map(); const P=x=>{if(!prof.has(x.j))prof.set(x.j,analyze(x.j,data));return prof.get(x.j)};
const team=(src,n)=>{const t=[],sp=new Set();let g=0;while(t.length<n&&g++<500){const x=src[r.int(src.length)];if(sp.has(x.id))continue;sp.add(x.id);t.push(P(x));}return t;};
const series=(A,B,la,lb)=>{const s=startSeries(A,B);while(!s.over){const t=s.battle.turn,a=s.battle.a,b=s.battle.b;resolveSeriesTurn(s,chooseSlot(a,b,t,r,la),chooseSlot(b,a,t,r,lb),r);}return s.result==='a'?1:s.result==='draw'?.5:0;};
const scale=(p,k)=>({...p,stats:{hp:Math.round(p.stats.hp*k),atk:Math.round(p.stats.atk*k),mat:Math.round(p.stats.mat*k),spd:Math.round(p.stats.spd*k)}});
const f=x=>String((100*x).toFixed(0)).padStart(3)+'%';
const top=pool.filter(x=>x.wr>=q(.995));  // 上位0.5%の個体を、ボスの素にする
// 素の個体の能力
const base=top.map(x=>x);const med=k=>{const v=base.map(x=>x[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
console.log('ボスの素（上位0.5%の個体）の能力の中央値: HP',med('hp'),'攻',med('atk'),'魔',med('mat'),'速',med('spd'),'件数',base.length);
console.log('\n■ 1体のボス（上位0.5%の個体を、能力を何倍かにする）VS プレイヤーの5体（AI：ボスはレベル4）。表の数字は、プレイヤーが勝つ確率');
console.log('倍率   | '+Object.keys(tiers).map(k=>k.padStart(8)).join(' '));
const N=300;
for(const k of [1.0,1.2,1.4,1.6,1.8,2.0]){
  const row=Object.values(tiers).map(src=>{let w=0;for(let i=0;i<N;i++){const b=scale(P(top[r.int(top.length)]),k);w+=series(team(src,5),[b],3,4);}return w/N;});
  console.log(`×${k.toFixed(1)}   | `+row.map(f).map(x=>x.padStart(8)).join(' '));
}
console.log('\n■ 5体のボスチーム（上位0.5%の個体を、能力を何倍かにする）VS プレイヤーの5体');
console.log('倍率   | '+Object.keys(tiers).map(k=>k.padStart(8)).join(' '));
for(const k of [1.0,1.1,1.2,1.3,1.5]){
  const row=Object.values(tiers).map(src=>{let w=0;for(let i=0;i<N;i++){const b=team(top,5).map(p=>scale(p,k));w+=series(team(src,5),b,3,4);}return w/N;});
  console.log(`×${k.toFixed(1)}   | `+row.map(f).map(x=>x.padStart(8)).join(' '));
}
