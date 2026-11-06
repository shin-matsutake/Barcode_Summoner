# Excel → data/monsters.json, data/skills.json
# 使い方: python3 tests/import_xlsx.py <モンスター表.xlsx> <共通技表.xlsx> [出力フォルダ(省略時 data)] [--dry-run] [--bump] [--allow-unparsed]
#   --dry-run         … 何も書き込まず、いまのJSONとの違いの一覧だけを出す（最初はこれで確認するのがおすすめ）
#   --bump            … 違いがあったとき、version.json の番号を1つ上げる（端末に古いデータが残らないように）
#   --allow-unparsed  … 読み取れない効果の文があっても書き込む（通常は、読み取れない文があると、何も書かずに止まる）
# 効果の読み取りは rebuild_effects.py が担当。書き方の決まり：1行＝1つの効果。行の先頭に条件。
# 列の並び（モンスター表）：A=ID(M000) B=名前 C=属性 D〜G=初期HP/攻撃/魔法攻撃/SPD H〜I=物理/魔法耐性 J=固有技名 K=属性 L=種別 M=威力 N=効果文 O=説明文
# 列の並び（共通技表）    ：A=ID(W001) B=技名 C=属性 D=種別 E=威力 F=効果文 G=説明文
import sys, re, json, os
from openpyxl import load_workbook
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rebuild_effects import parse, same_effects, EL, TY
F=lambda **k: k
MONSTER_MANUAL={}   # 文章では書き表せない効果を、番号ごとに手で指定する（いまは使っていない。例：{64:[F(op='onKill',heal=1000)]}）
def rows(path,prefix):
    wb=load_workbook(path,data_only=True)
    for ws in wb:
        for r in ws.iter_rows(values_only=True):
            if r and r[0] and re.match(rf'^{prefix}\d+$',str(r[0])): yield r
def clean(t): return re.sub(r'[ \u3000]+(?=\n|$)','',(t or '').replace('\r','')).strip()
def text_of(v): return clean(str(v)) if v is not None else ''
def build_monsters(path):
    mons={}; bad=[]
    for r in rows(path,'M'):
        i=int(r[0][1:]); txt=text_of(r[13]); ops,b=parse(txt)
        if i in MONSTER_MANUAL: ops,b=MONSTER_MANUAL[i],[]
        if b: bad.append((f'M{i:03d}',b))
        mons[i]={'id':i,'name':r[1],'el':EL[r[2]],'init':{'hp':r[3],'atk':r[4],'mat':r[5],'spd':r[6]},
          'res':{'phys':r[7],'mag':r[8]},
          'unique':{'name':r[9],'el':EL[r[10]],'type':TY[r[11]],'power':r[12],'effects':ops,'text':txt},
          'desc':text_of(r[14]) if len(r)>14 else '',
          'image':f'images/monsters/monster_{i:02d}.png'}
    assert sorted(mons)==list(range(100)),'モンスターIDが0〜99そろっていません（足りない番号：%s）'%sorted(set(range(100))-set(mons))
    return [mons[i] for i in range(100)],bad
def build_skills(path):
    sk={}; bad=[]
    for r in rows(path,'W'):
        i=int(r[0][1:])-1; txt=text_of(r[5]); ops,b=parse(txt)
        if b: bad.append((f'W{i+1:03d}',b))
        sk[i]={'id':i,'name':r[1],'el':EL[r[2]],'type':TY[r[3]],'power':r[4],'effects':ops,'text':txt,'desc':text_of(r[6]) if len(r)>6 else ''}
    assert sorted(sk)==list(range(100)),'共通技IDが100種そろっていません（足りない番号：%s）'%sorted(set(range(100))-set(sk))
    return [sk[i] for i in range(100)],bad
def flat(d,prefix=''):
    out={}
    for k,v in d.items():
        if k=='effects': continue
        if isinstance(v,dict): out.update(flat(v,prefix+k+'.'))
        else: out[prefix+k]=v
    return out
def diff_items(old,new,label):
    """いまのJSONと新しいJSONの違いを、人が読める行にする"""
    lines=[]
    for a,b in zip(old,new):
        fa,fb=flat(a),flat(b); ch=[f'{k}: {fa.get(k)!r} → {fb.get(k)!r}' for k in sorted(set(fa)|set(fb)) if fa.get(k)!=fb.get(k)]
        ea=(a.get('unique') or a).get('effects',[]); eb=(b.get('unique') or b).get('effects',[])
        if not same_effects(ea,eb): ch.append(f'効果: {json.dumps(ea,ensure_ascii=False)} → {json.dumps(eb,ensure_ascii=False)}')
        if ch: lines.append(f"{label(b)}\n    "+'\n    '.join(ch))
    return lines
if __name__=='__main__':
    args=[a for a in sys.argv[1:] if not a.startswith('--')]; flags={a for a in sys.argv[1:] if a.startswith('--')}
    if len(args)<2: sys.exit(__doc__)
    out=args[2] if len(args)>2 else 'data'
    m,b1=build_monsters(args[0]); s,b2=build_skills(args[1])
    bad=b1+b2
    if bad:
        print('【読み取れなかった効果の文】',len(bad),'件（効果が付かないままになります）')
        for lab,b in bad: print('  ',lab,b)
        if '--allow-unparsed' not in flags: sys.exit('→ 文章を直してから、もう一度実行してください。何も書き込んでいません。')
    changes=0
    for name,new,label in (('monsters',m,lambda x:f"M{x['id']:03d} {x['name']}"),('skills',s,lambda x:f"W{x['id']+1:03d} {x['name']}")):
        p=f'{out}/{name}.json'
        if os.path.exists(p):
            old=json.load(open(p,encoding='utf8'))[name]
            ls=diff_items(old,new,label); changes+=len(ls)
            print(f'【{name}】いまのJSONとの違い：{len(ls)}件'); [print(' ',l) for l in ls]
    print(f'違いの合計 {changes}件')
    if '--dry-run' in flags: sys.exit('（--dry-run のため、何も書き込んでいません）')
    json.dump({'monsters':m},open(f'{out}/monsters.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
    json.dump({'skills':s},open(f'{out}/skills.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
    print('書き込みました。monsters',len(m),'/ skills',len(s))
    vp=f'{out}/version.json'
    if changes and os.path.exists(vp):
        v=json.load(open(vp))['version']
        if '--bump' in flags: json.dump({'version':v+1},open(vp,'w')); print(f'version を {v} → {v+1} に上げました')
        else: print(f'※ 違いがあります。{vp} の番号（いま {v}）を上げてください（--bump で自動）。')
