import fs from 'node:fs';
import { analyze, ID_DIGITS, baseValue } from '../js/core/jan.js';
import { Rng } from '../js/core/rng.js';
import { simulate, CONFIG } from '../js/core/battle.js';
const root='data/';
const skills=JSON.parse(fs.readFileSync(root+'skills.json')).skills;
const orig=JSON.parse(fs.readFileSync(root+'monsters.json')).monsters;
const pct=x=>(100*x).toFixed(0)+'%';
const G=[[1,10,'スライム'],[11,20,'ゴブリン'],[21,30,'コボルド'],[31,40,'オーク'],[41,50,'ウルフ'],[51,62,'ゴーレム/ワイバ'],[63,74,'精霊/半獣'],[75,80,'キメラ'],[81,86,'ドラゴン'],[87,92,'四神'],[93,98,'幻獣'],[99,99,'魔王'],[0,0,'カーバンクル']];
export function evaluate(label,mut,K){
  CONFIG.DAMAGE_K=K; const monsters=JSON.parse(JSON.stringify(orig)); mut(monsters); const data={monsters,skills};
  const r=new Rng(99); const rjan=()=>Array.from({length:13},()=>r.int(10)).join('');
  const bucket=Array.from({length:100},()=>[]);
  while(bucket.some(b=>b.length<50)){const j=rjan();const id=baseValue([...j].map(Number),ID_DIGITS.species);if(bucket[id].length<50)bucket[id].push(j);}
  const all=bucket.flat(); const res=[]; let turnsAll=0,one=0,N=0;
  for(let id=0;id<100;id++){let w=0,d=0;for(let k=0;k<500;k++){const s=simulate(analyze(bucket[id][k%50],data),analyze(all[r.int(all.length)],data),r);const T=s.log.filter(e=>e.t==='turn').length;turnsAll+=T;N++;if(T===1)one++;if(s.result==='a')w++;else if(s.result==='draw')d+=.5;}res.push({id,wr:(w+d)/500});}
  const wr=res.map(x=>x.wr);
  console.log(`\n【${label}】K=${K}  平均${(turnsAll/N).toFixed(2)}T 1ターン決着${pct(one/N)} | 勝率 最小${pct(Math.min(...wr))} 最大${pct(Math.max(...wr))} | 40〜60%: ${wr.filter(v=>v>=.4&&v<=.6).length}体 / 40%未満: ${wr.filter(v=>v<.4).length} / 60%超: ${wr.filter(v=>v>.6).length}`);
  console.log('  '+G.map(([a,b,n])=>{const g=res.filter(x=>x.id>=a&&x.id<=b);return `${n}${pct(g.reduce((s,x)=>s+x.wr,0)/g.length)}`}).join(' '));
  const s=[...res].sort((a,b)=>b.wr-a.wr);
  console.log('  上位: '+s.slice(0,5).map(x=>`M${x.id}${orig[x.id].name}${pct(x.wr)}`).join(' '));
  console.log('  下位: '+s.slice(-5).map(x=>`M${x.id}${orig[x.id].name}${pct(x.wr)}`).join(' '));
  return res;
}
const range=(m,a,b,f)=>m.filter(x=>x.id>=a&&x.id<=b).forEach(f);
const v0=()=>{};
const v1=m=>{
  range(m,11,20,x=>{x.init.hp+=800;x.init.atk=100;});
  range(m,21,30,x=>{x.init.hp+=800;x.init.mat=100;});
  range(m,31,40,x=>{x.init.hp+=300;});
  range(m,1,10,x=>{if(x.id!==3)x.init.hp+=400;});
  range(m,93,98,x=>{x.init.hp=2000;x.init.atk=170;x.init.mat=170;});
  range(m,87,92,x=>{x.init.atk=170;x.init.mat=170;});
  range(m,81,86,x=>{x.init.hp=1800;});
  range(m,75,80,x=>{x.init.hp=1300;});
  m[99].init.hp=1500; m[99].unique.effects=[{op:'recoil',ratio:0.5}];
};
if (process.argv[2]==='run'){ evaluate('現状',v0,2); evaluate('K=1.4のみ',v0,1.4); evaluate('案1: K=1.4＋下位底上げ＋上位微減',v1,1.4); }
export const v2=m=>{
  v1(m);
  range(m,1,10,x=>{x.unique.power=Math.max(x.unique.power,60);});            // スライムの技威力 40→60
  for(const i of [12,14,16,18]){m[i].unique.effects=[{op:'selfDamage',n:30}];}  // ゴブリンの自傷を固定30に
  range(m,93,98,x=>{x.unique.power=130;});                                    // 幻獣の技威力 150→130
  m[85].unique.effects=[{op:'nextPower',n:60}];                                // ホワイトドラゴン +100→+60
  m[93].unique.effects=[{op:'heal',n:1000},{op:'nextHalf'}];                   // フェニックス 回復1500→1000
  m[95].unique.effects=[{op:'nextHalf'},{op:'nextPower',n:60}];                // ベヒモス +100→+60
  m[96].unique.effects=[{op:'heal',n:1500},{op:'nextDouble'}];                 // ジズ 回復2000→1500
};
if (process.argv[2]==='v2'){ evaluate('案2: 案1＋個別調整',v2,1.4); }
export const v3=m=>{
  v2(m);
  range(m,75,80,x=>{x.init.atk=Math.min(x.init.atk,120);x.init.hp=1200;});
  range(m,81,86,x=>{x.init.hp=1500;x.init.atk=Math.min(x.init.atk,130);x.init.mat=Math.min(x.init.mat,130);});
  range(m,87,92,x=>{x.init.hp=1300;x.init.atk=140;x.init.mat=140;});
  range(m,93,98,x=>{x.init.hp=1600;x.init.atk=140;x.init.mat=140;});
  range(m,1,10,x=>{if(x.id!==3)x.init.hp+=400;});
};
if (process.argv[2]==='v3'){ const res=evaluate('案3: 案2＋上位ステータス圧縮＋スライム底上げ',v3,1.4);
  const mm=JSON.parse(JSON.stringify(orig)); v3(mm);
  console.log('  勝率30%未満/70%超の個体:',res.filter(x=>x.wr<.35||x.wr>.65).map(x=>`M${x.id}${orig[x.id].name}${pct(x.wr)}`).join(' ')); }
