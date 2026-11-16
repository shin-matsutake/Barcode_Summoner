import fs from 'node:fs';
import { analyze } from '../../js/core/jan.js';
import { Rng } from '../../js/core/rng.js';
import { createFighter, newBattle, resolveTurn, allowedSlots, calcDamage } from '../../js/core/battle.js';
import { chooseSlot } from '../../js/ui/ai.js';
const D=new URL('../../data/',import.meta.url).pathname;
const data={monsters:JSON.parse(fs.readFileSync(D+'monsters.json')).monsters,skills:JSON.parse(fs.readFileSync(D+'skills.json')).skills};
const big=JSON.parse(fs.readFileSync('/tmp/bigpool.json')); const rr=new Rng(4321);
const P=new Map(); const prof=j=>{if(!P.has(j))P.set(j,analyze(j,data));return P.get(j)};
// 1ターンの結果の表（自分の技 × 相手の技 → 自分から見た損得）
function matrix(st,side,mine,theirs){
  const other=side==='a'?'b':'a', M=[];
  for(const i of mine){ const row=[]; for(const j of theirs){
    const c=structuredClone(st); const before={me:c[side].hp,op:c[other].hp};
    resolveTurn(c, side==='a'?i:j, side==='a'?j:i, new Rng(777));
    const dOp=(before.op-c[other].hp)/c[other].maxHp, dMe=(before.me-c[side].hp)/c[side].maxHp;
    let v=dOp-dMe; if(c[other].hp<=0&&c[side].hp>0)v+=1; if(c[side].hp<=0&&c[other].hp>0)v-=1;
    row.push(v);} M.push(row);} return M;
}
const best=(arr)=>arr.indexOf(Math.max(...arr));
function eqStrategy(M,iters=400){ // ゼロ和ゲームの均衡（架空のプレイの平均）
  const m=M.length,n=M[0].length, rc=Array(m).fill(0), cc=Array(n).fill(0); let ri=0,ci=0;
  for(let t=0;t<iters;t++){ rc[ri]++; cc[ci]++;
    const rv=M.map((row)=>row.reduce((a,v,j)=>a+v*cc[j],0)); ri=best(rv);
    const cv=Array(n).fill(0).map((_,j)=>M.reduce((a,row,i)=>a+row[j]*rc[i],0)); ci=cv.indexOf(Math.min(...cv)); }
  const s=rc.reduce((a,b)=>a+b,0); return rc.map(x=>x/s);
}
const sample=(w,ids,rng)=>{let x=rng.next()*w.reduce((a,b)=>a+b,0);for(let k=0;k<w.length;k++){x-=w[k];if(x<=0)return ids[k];}return ids[ids.length-1];};
// ---- AIの種類（st：戦闘の状態、side：自分の側、mem：この戦闘の記憶）----
const AIS={
  'ランダム':(st,s,rng)=>chooseSlot(st[s],st[s==='a'?'b':'a'],st.turn,rng,1),
  '威力重視':(st,s,rng)=>chooseSlot(st[s],st[s==='a'?'b':'a'],st.turn,rng,2),
  'ダメージ予測':(st,s,rng)=>chooseSlot(st[s],st[s==='a'?'b':'a'],st.turn,rng,3),
  '慎重':(st,s,rng)=>chooseSlot(st[s],st[s==='a'?'b':'a'],st.turn,rng,4),
  '猪突（最大ダメージ）':(st,s)=>{const me=st[s],op=st[s==='a'?'b':'a'];const ok=allowedSlots(me,st.turn);if(!ok.length)return null;return ok.map(i=>[i,calcDamage(me,me.profile.slots[i],op,st.turn)]).sort((a,b)=>b[1]-a[1])[0][0];},
  '読み屋（打消し狙い）':(st,s,rng)=>{ // 相手が選べる技（前に使った技は使えない）を知っていて、ダメージの大きい技を6割で出すと読み、いちばん得な技を出す
    const o=s==='a'?'b':'a', mine=allowedSlots(st[s],st.turn), theirs=allowedSlots(st[o],st.turn); if(!mine.length)return null; if(!theirs.length)return mine[0];
    const M=matrix(st,s,mine,theirs);
    const dmg=theirs.map(j=>calcDamage(st[o],st[o].profile.slots[j],st[s],st.turn)); const bi=best(dmg);
    const w=theirs.map((_,k)=>k===bi?0.6:0.4/Math.max(1,theirs.length-1)); const ev=M.map(row=>row.reduce((a,v,k)=>a+v*w[k],0));
    return mine[best(ev)]; },
  '均衡（読み合い最強）':(st,s,rng)=>{ const o=s==='a'?'b':'a', mine=allowedSlots(st[s],st.turn), theirs=allowedSlots(st[o],st.turn); if(!mine.length)return null; if(!theirs.length)return mine[0];
    const M=matrix(st,s,mine,theirs); const w=eqStrategy(M); return sample(w,mine,rng); },
  '石橋（最悪を避ける）':(st,s)=>{ const o=s==='a'?'b':'a', mine=allowedSlots(st[s],st.turn), theirs=allowedSlots(st[o],st.turn); if(!mine.length)return null; if(!theirs.length)return mine[0];
    const M=matrix(st,s,mine,theirs); return mine[best(M.map(row=>Math.min(...row)))]; },
  '癖読み（学習）':(st,s,rng,mem)=>{ const o=s==='a'?'b':'a', mine=allowedSlots(st[s],st.turn), theirs=allowedSlots(st[o],st.turn); if(!mine.length)return null; if(!theirs.length)return mine[0];
    if(st[o].prevSlot!=null){ const el=st[o].profile.slots[st[o].prevSlot].el; mem.cnt[el]=(mem.cnt[el]||0)+1; }
    const M=matrix(st,s,mine,theirs);
    const w=theirs.map(j=>1+(mem.cnt[st[o].profile.slots[j].el]||0)); const tot=w.reduce((a,b)=>a+b,0); const ev=M.map(row=>row.reduce((a,v,k)=>a+v*w[k]/tot,0)); return mine[best(ev)]; },
};
const mix=(base,p)=>(st,s,rng,mem)=>{ const ok=allowedSlots(st[s],st.turn); if(!ok.length)return null; return rng.chance(p)?rng.pick(ok):AIS[base](st,s,rng,mem); };
AIS['読み屋（ミス30%）']=mix('読み屋（打消し狙い）',0.3);
AIS['読み屋（ミス60%）']=mix('読み屋（打消し狙い）',0.6);
AIS['均衡（ミス30%）']=mix('均衡（読み合い最強）',0.3);
function play(na,nb,pa,pb,rng){
  const st=newBattle(createFighter(pa),createFighter(pb)); const ma={cnt:{}},mb={cnt:{}};
  while(!st.over){ const sa=AIS[na](st,'a',rng,ma), sb=AIS[nb](st,'b',rng,mb); resolveTurn(st,sa,sb,rng); }
  return st.result==='a'?1:st.result==='draw'?.5:0;
}
const names=Object.keys(AIS), N=Number(process.argv[2]||150);
// 公平のため、同じ組み合わせ（モンスターの強さ）を、左右を入れ替えて戦わせる
const pairs=Array.from({length:N},()=>[prof(big[rr.int(big.length)].j),prof(big[rr.int(big.length)].j)]);
const W={}; const t0=Date.now();
for(let x=0;x<names.length;x++) for(let y=x+1;y<names.length;y++){
  let w=0; const r=new Rng(1000+x*31+y);
  for(const [p,q] of pairs){ w+=play(names[x],names[y],p,q,r); w+=1-play(names[y],names[x],p,q,r); }
  W[names[x]+'|'+names[y]]=w/(2*N);
}
const wr=(x,y)=>x===y?null:(x<y?W[names[x]+'|'+names[y]]:1-W[names[y]+'|'+names[x]]);
console.log('総当たり（行の勝率。相手に対する。'+N+'組×左右入れ替え、'+((Date.now()-t0)/1000).toFixed(0)+'秒）');
const short=n=>n.split('（')[0];
console.log(''.padEnd(14)+names.map(n=>short(n).padStart(8)).join('')+'   平均');
const avg=[];
for(let x=0;x<names.length;x++){ const row=names.map((_,y)=>wr(x,y)); const a=row.filter(v=>v!=null).reduce((s,v)=>s+v,0)/(names.length-1); avg.push([names[x],a]);
  console.log(short(names[x]).padEnd(12)+row.map(v=>v==null?'      －':String(Math.round(v*100)+'%').padStart(8)).join('')+'   '+Math.round(a*100)+'%'); }
