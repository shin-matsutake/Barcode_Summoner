import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { createFighter, newBattle, resolveTurn } from '../../js/core/battle.js';
import { chooseSlot } from '../../js/ui/ai.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const r=new Rng(8888);
const duel=(pa,pb,la,lb)=>{const st=newBattle(createFighter(pa),createFighter(pb));while(!st.over)resolveTurn(st,chooseSlot(st.a,st.b,st.turn,r,la),chooseSlot(st.b,st.a,st.turn,r,lb),r);return [st.result==='a'?1:st.result==='draw'?.5:0,st.turn,st.result];};
const f=x=>(100*x).toFixed(0)+'%';
const pairs=[['0 新案 シャドウウルフ（効果つき技）','6759900504500','1033836826208'],['A シャドウウルフ（闇・旧）','2716517559495','1033836826208'],['B ウィンドウルフ（風）','5923379421434','1033836826208'],['C ウィンドウルフ（風）別個体','8867523194317','1033836826208']];
for(const [n,a,b] of pairs){
  const A=analyze(a,data),B=analyze(b,data);
  console.log(`\n■ ${n} ${a}  vs  ${B.monster.name} ${b}`);
  console.log(`   ウルフ HP${A.stats.hp} 攻${A.stats.atk} 魔${A.stats.mat} 速${A.stats.spd} 耐性${A.res.phys}/${A.res.mag}  技: ${A.slots.map(s=>`${s.name}(${s.el}/${s.type==='phys'?'物':'魔'}${s.power})`).join(' | ')}`);
  console.log(`   ゴブリン HP${B.stats.hp} 攻${B.stats.atk} 魔${B.stats.mat} 速${B.stats.spd} 耐性${B.res.phys}/${B.res.mag}  技: ${B.slots.map(s=>`${s.name}(${s.el}/${s.type==='phys'?'物':'魔'}${s.power})`).join(' | ')}`);
  for(const [lab,la,lb] of [['お互いランダム',1,1],['ボクが威力重視・相手ランダム',2,1],['ボクがダメージを読む・相手ランダム',3,1]]){
    const N=4000; let w=0,t=0,tc={},lose=0; for(let i=0;i<N;i++){const [x,tt,res]=duel(A,B,la,lb);w+=x;t+=tt;tc[Math.min(tt,7)]=(tc[Math.min(tt,7)]||0)+1;if(res==='b')lose++;}
    console.log(`   ${lab.padEnd(16)} 勝ち${f(w/N)}（負け${f(lose/N)}） 平均${(t/N).toFixed(2)}ターン  ターン分布 `+[3,4,5,6,7].map(k=>`${k}${k===7?'+':''}:${f((tc[k]||0)/N)}`).join(' '));
  }
}
