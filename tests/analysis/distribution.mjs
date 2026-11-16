import fs from 'node:fs';
const pool=JSON.parse(fs.readFileSync('/tmp/pool.json'));
const s=[...pool].sort((a,b)=>a.wr-b.wr), q=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];
const f=x=>(100*x).toFixed(0)+'%';
console.log('個体数',pool.length);
console.log('勝率の分布（個体）: 最低',f(s[0].wr),'下位10%',f(q(.1).wr),'25%',f(q(.25).wr),'中央',f(q(.5).wr),'75%',f(q(.75).wr),'上位10%',f(q(.9).wr),'上位5%',f(q(.95).wr),'上位1%',f(q(.99).wr),'上位0.1%',f(q(.999).wr),'最高',f(s[s.length-1].wr));
console.log('\n強さの帯ごとの、個体の能力の中央値（HP / 攻撃 / 魔法攻撃 / SPD）');
const band=(lo,hi,label)=>{const g=pool.filter(x=>x.wr>=lo&&x.wr<hi);if(!g.length)return;const med=k=>{const v=g.map(x=>x[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};console.log(label.padEnd(10),'勝率',f(lo),'〜',f(hi),'件数',String(g.length).padStart(5),`HP${med('hp')} 攻${med('atk')} 魔${med('mat')} 速${med('spd')}`)};
[[0,.2,'下位'],[.2,.35,''],[.35,.45,''],[.45,.55,'中央'],[.55,.65,''],[.65,.75,''],[.75,.85,''],[.85,.92,''],[.92,.97,''],[.97,1.01,'最上位']].forEach(b=>band(...b));
// 全体の能力の範囲
const mm=k=>{const v=pool.map(x=>x[k]).sort((a,b)=>a-b);return `${v[0]}〜${v[v.length-1]}（中央${v[Math.floor(v.length/2)]}）`};
console.log('\n全体の範囲: HP',mm('hp'),'攻',mm('atk'),'魔',mm('mat'),'速',mm('spd'));
// カーバンクル（一幕の個体）の位置
const c={hp:2150,atk:215,mat:200,spd:275};
const rank=k=>{const v=pool.map(x=>x[k]).sort((a,b)=>a-b);return f(v.filter(x=>x<=c[k]).length/v.length)};
console.log('\n一幕のカーバンクルの能力の順位（全体の下から）: HP',rank('hp'),'攻',rank('atk'),'魔',rank('mat'),'速',rank('spd'));
const cs=pool.filter(x=>x.id===0); console.log('カーバンクル（M000）の個体の勝率: 平均',f(cs.reduce((a,x)=>a+x.wr,0)/cs.length),' 件数',cs.length);
// 種ごとの平均勝率（上位・下位）
const by={}; for(const x of pool){(by[x.id]??={n:x.name,el:x.el,w:0,c:0}); by[x.id].w+=x.wr; by[x.id].c++;}
const sp=Object.entries(by).map(([id,v])=>({id:+id,n:v.n,el:v.el,wr:v.w/v.c})).sort((a,b)=>a.wr-b.wr);
console.log('\n種の強さ（平均勝率）上位8:',sp.slice(-8).reverse().map(x=>`M${String(x.id).padStart(3,'0')}${x.n}${f(x.wr)}`).join(' '));
console.log('下位8:',sp.slice(0,8).map(x=>`M${String(x.id).padStart(3,'0')}${x.n}${f(x.wr)}`).join(' '));
