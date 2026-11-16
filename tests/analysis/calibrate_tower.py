import json, subprocess, sys, os
from openpyxl import load_workbook
import os
PROJ=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); XL=sys.argv[2] if len(sys.argv)>2 else os.path.join(PROJ,'タワー管理表.xlsx')
rnd=int(sys.argv[1]); LO,HI=6,25
DES_NORMAL,DES_BOSS=0.60,0.42     # 想定層の通過率の狙い（通常・ボス）
wb=load_workbook(XL); ws=wb['ステージ']; wt=wb['敵チーム']
meta={}
for r in range(2,28):
    s=ws.cell(row=r,column=1).value
    meta[s]=dict(row=r,boss=ws.cell(row=r,column=3).value=='○',bring=ws.cell(row=r,column=4).value,fight=ws.cell(row=r,column=5).value,ai=ws.cell(row=r,column=6).value,target=ws.cell(row=r,column=7).value,tier=ws.cell(row=r,column=8).value)
tg=json.load(open('/tmp/targets.json')) if os.path.exists('/tmp/targets.json') and rnd>0 else {str(s):meta[s]['target'] for s in range(LO,HI+1)}
used=[]
for s in range(1,6):
    for p in range(3):
        for k in range(5):
            v=wt.cell(row=2+(s-1)*3+p,column=3+k).value
            if v: used.append(str(v))
json.dump({'stages':[{'stage':s,'target':tg[str(s)],'bring':meta[s]['bring'],'fight':meta[s]['fight'],'ai':meta[s]['ai'],'tier':meta[s]['tier'],'desired':(DES_BOSS if meta[s]['boss'] else DES_NORMAL)} for s in range(LO,HI+1)],'used':used,'seed':100+rnd,'candidates':6,'passN':80},open('/tmp/fill_in.json','w'))
subprocess.run(['node',os.path.join(PROJ,'tests','analysis','fill_tower.mjs')],check=True)
out=json.load(open('/tmp/fill_out.json'))
for s in range(LO,HI+1):
    for p,team in enumerate(out['teams'][str(s)]):
        for k in range(5):
            c=wt.cell(row=2+(s-1)*3+p,column=3+k,value=team[k]); c.number_format='@'
    ws.cell(row=meta[s]['row'],column=7,value=round(tg[str(s)],3))
wb.save(XL)
subprocess.run(['python3','tests/tower_xlsx.py','import',XL,'--n','120','--no-bump'],cwd=PROJ,check=True,stdout=subprocess.DEVNULL)
rate=json.load(open('/tmp/tower_rating.json')); new={}
print('階層 ボス ルール AI  目標  実際の平均E  想定層   通過率(想定層)  → 次の目標')
for st in rate['stages']:
    s=st['stage']
    if s<LO or s>HI: continue
    m=meta[s]; Es=[t['teamE'] for t in st['teams']]; ps=[t['pass'][m['tier']] for t in st['teams']]
    pm=sum(ps)/len(ps); des=DES_BOSS if m['boss'] else DES_NORMAL
    d=max(-.04,min(.04,0.8*(pm-des)/3.8)); nt=max(.50,min(.985,tg[str(s)]+d)); new[str(s)]=nt
    print(f"{s:>3} {'○' if m['boss'] else ' '}   {st['bring']}/{st['fight']}  {st['ai']}  {tg[str(s)]:.3f}  {sum(Es)/len(Es):.3f}   {m['tier']:<6} {pm*100:4.0f}% ({'/'.join(f'{x*100:.0f}' for x in ps)})  → {nt:.3f}")
def pav(ys):
    blocks=[[y,1] for y in ys]
    i=0
    while i<len(blocks)-1:
        if blocks[i][0]>blocks[i+1][0]:
            y=(blocks[i][0]*blocks[i][1]+blocks[i+1][0]*blocks[i+1][1])/(blocks[i][1]+blocks[i+1][1]); n=blocks[i][1]+blocks[i+1][1]; blocks[i:i+2]=[[y,n]]; i=max(i-1,0)
        else: i+=1
    out=[]
    for y,n in blocks: out+=[y]*n
    return out
norm=[x for x in range(LO,HI+1) if not meta[x]['boss']]
base=dict(zip(norm,pav([new[str(x)] for x in norm])))
def baseline(x):
    lo=max([n for n in norm if n<x],default=None); hi=min([n for n in norm if n>x],default=None)
    if lo is None: return base[hi]
    if hi is None: return base[lo]
    return base[lo]+(base[hi]-base[lo])*(x-lo)/(hi-lo)
final={}
for x in range(LO,HI+1):
    if not meta[x]['boss']: final[str(x)]=base[x]
    else: b=baseline(x); final[str(x)]=max(.50,min(.985,b+max(.01,min(.05,new[str(x)]-b))))
print('平滑化した次の目標:',' '.join(f'{x}:{final[str(x)]:.3f}' for x in range(LO,HI+1)))
json.dump(final,open('/tmp/targets.json','w'))
