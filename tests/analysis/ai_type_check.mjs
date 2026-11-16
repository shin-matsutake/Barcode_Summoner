import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { createFighter, calcDamage } from '../../js/core/battle.js';
import { chooseSlot } from '../../js/ui/ai.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const big=JSON.parse(fs.readFileSync('/tmp/bigpool.json')); const r=new Rng(2468);
const prof=j=>analyze(j,data);
let N=0, sub=0, subRes=0; const hit={1:0,2:0,3:0,4:0}, hitRes={1:0,2:0,3:0,4:0};
for(let k=0;k<6000;k++){
  const A=prof(big[r.int(big.length)].j), B=prof(big[r.int(big.length)].j);
  const fa=createFighter(A), fb=createFighter(B);
  const dmg=A.slots.map(s=>calcDamage(fa,{el:s.el,type:s.type,power:s.power},fb,1,{}));
  const best=dmg.indexOf(Math.max(...dmg)); N++;
  // 「威力がいちばん大きい技」が、実際にいちばんダメージが出る技とは限らない場面（物理・魔法・属性の違いで逆転する場面）
  const pw=A.slots.map(s=>s.power), byPower=pw.indexOf(Math.max(...pw));
  if(best!==byPower && dmg[best]>=dmg[byPower]*1.15){
    sub++; const typeDiff=A.slots[best].type!==A.slots[byPower].type; if(typeDiff) subRes++;
    for(const L of [1,2,3,4]){ for(let t=0;t<20;t++){ const c=chooseSlot(createFighter(A),createFighter(B),1,r,L); if(c===best){hit[L]+=1/20; if(typeDiff)hitRes[L]+=1/20;} } }
  }
}
const f=x=>(100*x).toFixed(0)+'%';
console.log(`初手の判断 ${N}件のうち、威力の大きい技より、別の技のほうが15%以上ダメージが出る場面：${sub}件（${f(sub/N)}）。そのうち、物理・魔法が入れ替わる場面：${subRes}件`);
console.log('その場面で、いちばんダメージの出る技を選べる割合:');
const names={1:'ランダム',2:'威力重視',3:'ダメージ予測',4:'慎重'};
for(const L of [1,2,3,4]) console.log(`  ${names[L].padEnd(8)} ${f(hit[L]/sub)}（物理・魔法が入れ替わる場面だけだと ${f(hitRes[L]/subRes)}）`);
