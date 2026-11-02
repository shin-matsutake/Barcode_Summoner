# Excel → data/monsters.json, data/skills.json
# 使い方: python3 tests/import_xlsx.py <モンスター表.xlsx> <共通技表.xlsx>
import sys, re, json
from openpyxl import load_workbook
EL={'火':'fire','水':'water','土':'earth','風':'wind','光':'light','闇':'dark'}
TY={'物理':'phys','魔法':'mag'}
NONE=r'追加効果なし|ただこん棒|斧を振り下ろして'
def parse(t):
    t=re.sub(r'[\s\u3000]','',t or ''); ops=[]
    if re.search(NONE,t): return ops
    for m in re.finditer(r'(先制攻撃なら|後攻攻撃なら|相手の攻撃を打消した場合|相手が(火|水|土|風|光|闇)属性ならさらに)?威力(\d+)の追加(物理|魔法)攻撃',t):
        c=None
        if m.group(1): c='first' if m.group(1).startswith('先制') else 'last' if m.group(1).startswith('後攻') else 'nullifiedFoe' if m.group(1).startswith('相手の攻撃を打消') else 'foeEl:'+EL[m.group(2)]
        ops.append({'op':'extra','type':TY[m.group(4)],'power':int(m.group(3)),**({'cond':c} if c else {})})
    for m in re.finditer(r'(物理|魔法)威力(\d+)の攻撃を追加',t): ops.append({'op':'extra','type':TY[m.group(1)],'power':int(m.group(2))})
    for m in re.finditer(r'(先制攻撃|後攻攻撃)なら威力(\d+)追加(?!の)',t):
        ops.append({'op':'bonus','power':int(m.group(2)),'cond':'first' if m.group(1)=='先制攻撃' else 'last'})
    m=re.search(r'与えたダメージの(\d)分の(\d)HPを回復',t)
    if m: ops.append({'op':'drain','ratio':int(m.group(2))/int(m.group(1))})
    m=re.search(r'与えたダメージの(\d)分の(\d)HP[のに]?ダメージを受ける',t)
    if m: ops.append({'op':'recoil','ratio':int(m.group(2))/int(m.group(1))})
    m=re.search(r'自分にも威力(\d+)の(魔法|物理)?(.)属性ダメージ',t)
    if m: ops.append({'op':'selfAttack','power':int(m.group(1)),**({'type':TY[m.group(2)]} if m.group(2) else {})})
    m=re.search(r'(?:自分に(\d+)ダメージ|HP(\d+)のダメージを受ける)',t)
    if m: ops.append({'op':'selfDamage','n':int(m.group(1) or m.group(2))})
    m=re.search(r'HPを?(\d+)回復',t)
    if m: ops.append({'op':'heal','n':int(m.group(1))})
    if '次のターン自分が先制できる' in t: ops.append({'op':'nextFirst'})
    m=re.search(r'次のターン自分の攻撃の威力を＋(\d+)',t)
    if m: ops.append({'op':'nextPower','n':int(m.group(1))})
    if '次のターン受けるダメージを半減' in t: ops.append({'op':'nextHalf'})
    if re.search(r'次のターン受けるダメージ[をが]倍',t): ops.append({'op':'nextDouble'})
    if 'このターン必ず後攻' in t: ops.append({'op':'forceLast'})
    if '次のターン行動ができない' in t: ops.append({'op':'selfStun'})
    return ops
F=lambda **k: k
MONSTER_MANUAL={ # 文章が複雑なもの（解釈は docs/解釈メモ に記載）
 39:[F(op='forceLast'),F(op='drainIfFoeLower')],
 40:[F(op='forceLast'),F(op='duel')],
 64:[F(op='onKill',heal=1000,nextPower=100)],
 73:[F(op='extra',type='mag',power=50),F(op='ignoreRes')],
 80:[F(op='forceLast'),F(op='heal',n=1500,cond='foeHpHigher'),F(op='extra',type='phys',power=60,cond='foeHpHigher')],
 91:[F(op='drain',ratio=1.0,cond='foeSkillEl:light'),F(op='extra',type='phys',power=100,cond='clash'),F(op='extra',type='mag',power=100,cond='clash')],
 92:[F(op='drain',ratio=0.75,cond='foeSkillEl:dark'),F(op='extra',type='phys',power=130,cond='clash'),F(op='extra',type='mag',power=130,cond='clash')],
 98:[F(op='nullifyFoe',cond='first')],
 0:[F(op='forceFirst'),F(op='nullifyFoe'),F(op='extra',type='mag',power=40)],
}
SKILL_MANUAL={ # 共通技（ID=W番号-1）
 **{i:[F(op='halfNow',cond='first'),F(op='bonus',power=40,cond='last')] for i in range(72,78)},   # W073-78
 84:[F(op='extra',type='phys',power=40,cond='first'),F(op='extra',type='mag',power=40,cond='first'),F(op='nextPowerDouble',cond='last')],
 85:[F(op='extra',type='mag',power=80,cond='first'),F(op='extra',type='phys',power=80,cond='last')],
 86:[F(op='nullifyFoe',cond='first',foeType='phys'),F(op='extra',type='phys',power=80,cond='last')],
 87:[F(op='halfNow',cond='first'),F(op='extra',type='mag',power=80,cond='last')],
 88:[F(op='halfNow',cond='first'),F(op='nextPowerDouble',cond='last')],
 89:[F(op='nullifyFoe',cond='first',foeType='mag'),F(op='extra',type='mag',power=80,cond='last')],
}
def rows(path,prefix):
    wb=load_workbook(path,data_only=True)
    for ws in wb:
        for r in ws.iter_rows(values_only=True):
            if r[0] and re.match(rf'^{prefix}\d+$',str(r[0])): yield r
def build_monsters(path):
    mons={}; bad=[]
    for r in rows(path,'M'):
        i=int(r[0][1:]); text=re.sub(r'[\s\u3000]','',r[13] or '')
        ops=MONSTER_MANUAL[i] if i in MONSTER_MANUAL else parse(r[13])
        if not ops and not re.search(NONE,text): bad.append((i,text))
        mons[i]={'id':i,'name':r[1],'el':EL[r[2]],'init':{'hp':r[3],'atk':r[4],'mat':r[5],'spd':r[6]},
          'res':{'phys':r[7],'mag':r[8]},
          'unique':{'name':r[9],'el':EL[r[10]],'type':TY[r[11]],'power':r[12],'effects':ops,'text':text},
          'image':f'images/monsters/monster_{i:02d}.png'}
    assert sorted(mons)==list(range(100)),'モンスターIDが0〜99そろっていません'
    return [mons[i] for i in range(100)],bad
def build_skills(path):
    sk={}; bad=[]
    for r in rows(path,'W'):
        i=int(r[0][1:])-1; text=re.sub(r'[\s\u3000]','',r[5] or '')
        ops=SKILL_MANUAL[i] if i in SKILL_MANUAL else parse(r[5])
        if not ops and not re.search(NONE,text): bad.append((i,text))
        sk[i]={'id':i,'name':r[1],'el':EL[r[2]],'type':TY[r[3]],'power':r[4],'effects':ops,'text':text}
    assert sorted(sk)==list(range(100)),'共通技IDが100種そろっていません'
    return [sk[i] for i in range(100)],bad
if __name__=='__main__':
    m,b1=build_monsters(sys.argv[1]); s,b2=build_skills(sys.argv[2])
    json.dump({'monsters':m},open('data/monsters.json','w'),ensure_ascii=False,indent=1)
    json.dump({'skills':s},open('data/skills.json','w'),ensure_ascii=False,indent=1)
    print('monsters',len(m),'unparsed',b1,'| skills',len(s),'unparsed',b2)
