// 強さの目標から、階層ごとに、敵チーム（3パターン×5体）を選ぶ。候補を多めに作り、実際に戦わせて、狙いの通過率に近い3つを選ぶ
import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { simulate } from '../../js/core/battle.js';
import { startSeries, resolveSeriesTurn } from '../../js/core/series.js';
import { chooseSlot } from '../../js/ui/ai.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const inp=JSON.parse(fs.readFileSync('/tmp/fill_in.json')); const r=new Rng(inp.seed||1);
const pool=JSON.parse(fs.readFileSync('/tmp/bigpool.json'));
const profs=new Map(); const P=j=>{if(!profs.has(j))profs.set(j,analyze(j,data));return profs.get(j)};
const opp=Array.from({length:3000},()=>P(pool[r.int(pool.length)].j));
const score=x=>x.result==='a'?1:x.result==='draw'?.5:0;
const measure=(j,N)=>{const p=P(j);let w=0;for(let k=0;k<N;k++)w+=score(simulate(p,opp[r.int(opp.length)],r));return w/N;};
const sortedW=[...pool].sort((a,b)=>a.wr-b.wr), q=p=>sortedW[Math.min(sortedW.length-1,Math.floor(p*sortedW.length))].wr;
const TIER={'平均':pool,'上位30%':pool.filter(x=>x.wr>=q(.70)),'上位10%':pool.filter(x=>x.wr>=q(.90)),'上位3%':pool.filter(x=>x.wr>=q(.97)),'上位1%':pool.filter(x=>x.wr>=q(.99))};
const used=new Set(inp.used||[]);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const k=r.int(i+1);[a[i],a[k]]=[a[k],a[i]];}return a;};
const mteam=(src,n)=>{const t=[],sp=new Set();let g=0;while(t.length<n&&g++<1000){const x=src[r.int(src.length)];if(sp.has(x.id))continue;sp.add(x.id);t.push(P(x.j));}return t;};
const series=(A,B,lb)=>{const s=startSeries(A,B);while(!s.over){const t=s.battle.turn,a=s.battle.a,b=s.battle.b;resolveSeriesTurn(s,chooseSlot(a,b,t,r,3),chooseSlot(b,a,t,r,lb),r);}return s.result==='a'?1:s.result==='draw'?.5:0;};
const K=inp.candidates||6, PN=inp.passN||80;
const out={teams:{},report:{}};
for(const st of inp.stages){
  const T=st.target, coarse=shuffle(pool.filter(x=>Math.abs(x.wr-T)<=0.15&&!used.has(x.j))); let ci=0;
  const reserved=new Set(), cands=[];
  for(let c=0;c<K;c++){
    const team=[], sp=new Set(), elc={};
    while(team.length<5 && ci<coarse.length){
      const x=coarse[ci++]; if(used.has(x.j)||reserved.has(x.j)||sp.has(x.id)||(elc[x.el]||0)>=3) continue;
      const E=measure(x.j,250); if(Math.abs(E-T)>0.035) continue;
      team.push({j:x.j,E,id:x.id,el:x.el}); sp.add(x.id); elc[x.el]=(elc[x.el]||0)+1; reserved.add(x.j);
    }
    if(team.length<5) break;
    const fighters=team.slice(0,st.fight).sort((a,b)=>a.E-b.E), bench=team.slice(st.fight);
    cands.push([...fighters,...bench]);
  }
  if(cands.length<3) throw new Error(`階層${st.stage}：目標${T}に合う候補が足りません（候補チーム${cands.length}）`);
  // 候補を、実際に戦わせて、狙いの通過率に近い順に並べる
  for(const t of cands){const foe=t.slice(0,st.fight).map(m=>P(m.j));let w=0;for(let i=0;i<PN;i++)w+=series(mteam(TIER[st.tier],st.fight),foe,st.ai);t.pass=w/PN;t.Em=t.slice(0,st.fight).reduce((a,m)=>a+m.E,0)/st.fight;}
  // 3つは、狙いに近いものから。ただし、同じ種類が重ならないように
  cands.sort((a,b)=>Math.abs(a.pass-st.desired)-Math.abs(b.pass-st.desired));
  const pick=[]; const spUsed=new Set();
  for(const t of cands){ if(pick.length>=3)break; const ids=t.map(m=>m.id); const overlap=ids.filter(i=>spUsed.has(i)).length; if(overlap>2&&cands.length>pick.length+3)continue; pick.push(t); ids.forEach(i=>spUsed.add(i)); }
  for(const t of cands){ if(pick.length>=3)break; if(!pick.includes(t))pick.push(t); }
  pick.forEach(t=>t.forEach(m=>used.add(m.j)));
  out.teams[st.stage]=pick.map(t=>t.map(m=>m.j));
  out.report[st.stage]={target:T,cands:cands.length,pass:pick.map(t=>+t.pass.toFixed(2)),E:pick.map(t=>+t.Em.toFixed(3))};
}
fs.writeFileSync('/tmp/fill_out.json',JSON.stringify(out));
console.log('選んだ（候補での通過率）:',inp.stages.map(s=>`${s.stage}:${out.report[s.stage].pass.map(x=>Math.round(x*100)).join('/')}`).join('  '));
