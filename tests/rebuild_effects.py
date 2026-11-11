# 効果の文章（text）→ 効果の部品（effects）への変換。ExcelからJSONを作る道具（import_xlsx.py）が使う。
# 単体でも使える：
#   python3 tests/rebuild_effects.py --check        … data/*.json の text から効果を作り直し、いまの effects と違う技を一覧にする（何も書き換えない）
#   python3 tests/rebuild_effects.py --write        … 違う技の effects を、text から作り直した内容で書き換える
# 書き方の決まり：1行＝1つの効果。行の先頭に条件（先攻なら／後攻なら／相手のHPが自分より多ければ 等）。
# 読み取れない文は「unparsed」として必ず報告する（効果が黙って落ちることはない）。
import re, sys, json
EL={'火':'fire','水':'water','土':'earth','風':'wind','光':'light','闇':'dark'}
TY={'物理':'phys','魔法':'mag'}
ELS='火|水|土|風|光|闇'
FW=str.maketrans('０１２３４５６７８９＋','0123456789+')
# 行頭の条件（先頭から順に判定）。(正規表現, cond名 または 関数)
PREFIX=[
 (r'^(?:先攻なら|先攻の場合|先制攻撃なら)、?','first'),
 (r'^(?:後攻なら|後攻の場合|後攻攻撃なら)、?','last'),
 (r'^攻撃後、?相手のHPが自分より多ければ、?(?:さらに)?','afterFoeHpHigher'),
 (r'^攻撃後、?相手のHPが自分より少なければ、?(?:さらに)?','afterFoeHpLower'),
 (r'^HPが自分より多ければ、?','afterFoeHpHigher'),      # 直前の行が「攻撃後〜」の続き
 (r'^少なければ、?','afterFoeHpLower'),
 (r'^相手のHPが自分より多ければ、?(?:さらに)?','foeHpHigher'),
 (r'^相手のHPが自分より少なければ、?(?:さらに)?','foeHpLower'),
 (r'^自分のHPが相手より多ければ、?','foeHpLower'),
 (rf'^相手が({ELS})属性なら、?(?:さらに)?',lambda m:'foeEl:'+EL[m.group(1)]),
 (rf'^相手の攻撃が({ELS})属性なら、?',lambda m:'foeSkillEl:'+EL[m.group(1)]),
 (r'^相手の攻撃を打(?:ち)?消した場合、?','nullifiedFoe'),
 (r'^打(?:ち)?消しが発生した場合、?','clash'),
]
def cond_of(line):
    for pat,c in PREFIX:
        m=re.match(pat,line)
        if m: return (c(m) if callable(c) else c), line[m.end():]
    return None,line
def parse_line(body,cond):
    """1行の本文から、効果の部品を取り出す。戻り値：(ops, 読み取れなかった残り)"""
    ops=[]; s=body
    def take(pat,fn):
        nonlocal s
        for m in list(re.finditer(pat,s)):
            r=fn(m)
            if r is None: continue
            for o in (r if isinstance(r,list) else [r]):
                if cond and 'cond' not in o: o['cond']=cond
                ops.append(o)
        s=re.sub(pat,'',s)
    E=lambda t,p,**k:{'op':'extra','type':TY[t],'power':int(p),**k}
    # --- 特殊なもの（先に判定）---
    take(r'条件、?属性に関係なく相手の攻撃を無効化し、?無効化した攻撃(?:と同じ条件の追加攻撃をする|を、?反動や追加効果もふくめて、?コピーして追加で使う)',lambda m:[{'op':'nullifyFoe'},{'op':'copyFoe'}])
    take(r'この効果で受けたダメージで自分のHPが0になった場合、?威力(\d+)の追加(物理|魔法)攻撃(?:を与える)?',lambda m:{'op':'counterOnSelfKO','type':TY[m.group(2)],'power':int(m.group(1))})
    take(r'追加(?:物理|魔法)?攻撃で相手を倒した場合、?(?:体力|HP)を(\d+)回復(?:する)?',lambda m:{'op':'_healOnKill','n':int(m.group(1))})
    take(r'この攻撃で相手を倒した場合、?(?:自分の)?(?:HP|体力)を?(\d+)回復(?:する)?',lambda m:{'op':'onKill','heal':int(m.group(1))})
    take(r'自分のHPを0にする',lambda m:{'op':'selfKO'})
    take(r'耐久を無視してダメージを与える|相手の物理、?魔法耐久を無視してダメージを与える',lambda m:{'op':'ignoreRes'})
    # --- 追加攻撃（素早さ変換つきを先に）---
    take(r'(?:攻撃後、?)?素早さを攻撃力変換し、?威力(\d+)の追加(物理|魔法)攻撃',lambda m:E(m.group(2),m.group(1),stat='spd'))
    take(r'威力(\d+)の?(?:追加)?(物理|魔法)攻撃(?:を与える)?',lambda m:E(m.group(2),m.group(1)))   # 追加あり／なし（「〜を与える」）／「の」なし
    take(r'(物理|魔法)威力(\d+)の攻撃を追加',lambda m:E(m.group(1),m.group(2)))                      # 旧表記
    # --- 次のターンの効果 ---
    take(rf'次のターン(?:の)?自分の攻撃が({ELS})属性なら(?:技の)?威力を?\+?(\d+)(?:追加)?(?:する)?',lambda m:{'op':'nextPowerEl','el':EL[m.group(1)],'n':int(m.group(2))})
    take(r'次のターン(?:の)?(?:自分の)?(?:攻撃|技)の威力を(?:倍|2倍)にする',lambda m:{'op':'nextPowerDouble'})
    take(r'次のターン(?:の)?(?:自分の)?(?:攻撃|技)の威力を?\+?(\d+)(?:追加)?',lambda m:{'op':'nextPower','n':int(m.group(1))})
    take(r'次のターン(?:に)?受けるダメージを半減(?:する)?',lambda m:{'op':'nextHalf'})
    take(r'次のターン(?:に)?受けるダメージを倍にする',lambda m:{'op':'nextDouble'})
    take(r'次のターン自分が(?:先制できる|先攻になる)',lambda m:{'op':'nextFirst'})
    take(r'次のターン行動ができない',lambda m:{'op':'selfStun'})
    # --- このターンの効果 ---
    take(r'(?:このターン)?必ず後攻になる',lambda m:{'op':'forceLast'})
    take(r'(?:このターン)?必ず(?:先攻になる|先制できる)',lambda m:{'op':'forceFirst'})
    take(r'(?:このターンの)?相手の(物理|魔法)?攻撃を無効化(?:する|し)',lambda m:{'op':'nullifyFoe',**({'foeType':TY[m.group(1)]} if m.group(1) else {})})
    take(r'受けるダメージを半減(?:する)?',lambda m:{'op':'halfNow'})
    # --- 反動・吸収・回復・自傷（分数は「N分のM」に正規化済み）---
    take(r'(?:相手に)?与えたダメージの(\d+)分の(\d+)(?:HP)?(?:[のに]?ダメージ)?を?(?:自分も)?受ける',lambda m:{'op':'recoil','ratio':int(m.group(2))/int(m.group(1))})
    take(r'(?:相手に)?与えたダメージの(\d+)分の(\d+)(?:分|の)?(?:HP)?を回復(?:する)?|(?:相手に)?与えたダメージの(\d+)分の(\d+)(?:分)?、(?:自分の)?HPを回復(?:する)?',
         lambda m:{'op':'drain','ratio':(int(m.group(2))/int(m.group(1))) if m.group(1) else (int(m.group(4))/int(m.group(3)))})
    take(r'(?:相手に)?与えたダメージ分、?(?:自分の)?HPを回復(?:する)?',lambda m:{'op':'drain','ratio':1.0})
    take(r'(?:自分の)?HPを?(\d+)回復(?:する|し)?',lambda m:{'op':'heal','n':int(m.group(1))})
    take(r'自分にも威力(\d+)の(魔法|物理)(?:'+ELS+r')属性ダメージ',lambda m:{'op':'selfAttack','power':int(m.group(1)),'type':TY[m.group(2)]})
    take(r'自分に威力(\d+)の(物理|魔法)ダメージ',lambda m:{'op':'selfAttack','power':int(m.group(1)),'type':TY[m.group(2)]})
    take(r'自分に(\d+)(?:の)?ダメージ|HP(\d+)のダメージを受ける',lambda m:{'op':'selfDamage','n':int(m.group(1) or m.group(2))})
    # --- 威力の追加（技本体）---
    take(r'威力を?\+?(\d+)追加(?:する)?',lambda m:{'op':'bonus','power':int(m.group(1))})
    take(r'威力を?\+(\d+)',lambda m:{'op':'bonus','power':int(m.group(1))})
    return ops,s
def parse(text):
    """効果文 → (ops, unparsed)。行（改行区切り）ごとに条件を判定する"""
    t=(text or '').translate(FW).replace('\r','')
    # 「追加効果なし」だけの1行は、効果なし。ほかの行と一緒に書かれているときは、通常どおり読む（効果が黙って落ちないように）
    if len([l for l in t.split('\n') if l.strip()])==1 and '追加効果なし' in t: return [],[]
    # 分数の書き方をそろえる：1/4 → 4分の1、「ダメージの半分」→ 2分の1
    t=re.sub(r'(\d+)/(\d+)',r'\2分の\1',t); t=t.replace('ダメージの半分','ダメージの2分の1')
    # 括弧の注記を取り出す（追加攻撃では回復しない、等）
    notes=re.findall(r'（([^）]*)）',t); t=re.sub(r'（[^）]*）','',t)
    lines=[l for l in t.split('\n') if l.strip()]
    ops=[]; bad=[]; carry=None
    for ln in lines:
        ln=re.sub(r'[\s\u3000]+','',ln)              # 行の中の空白は、誤入力として無視する
        cond,body=cond_of(ln)
        if cond is None: cond=carry
        if not body: carry=cond; continue            # 条件だけの行は、次の行に引き継ぐ
        carry=None
        o,rest=parse_line(body,cond)
        rest=re.sub(r'[、。]|する|し(?=、|$)|さらに|と|を与える','',rest)
        if rest: bad.append(ln)
        ops+=o
    out=[]
    for o in ops:
        if o['op']=='_healOnKill':   # ひとつ前の counterOnSelfKO に付ける
            for p in reversed(out):
                if p['op']=='counterOnSelfKO': p['healOnKill']=o['n']; break
        else: out.append(o)
    # 反動などで倒れたときの反撃は、反動の処理のあとで判定される必要があるので、いちばん後ろに置く
    out.sort(key=lambda o:o['op']=='counterOnSelfKO')
    for n in notes:
        if '追加攻撃ではHPは回復しない' in n:
            for o in out:
                if o['op'] in ('drain','recoil'): o['excludeExtras']=True
        elif re.search(r'追加攻撃も反動ダメージを受ける|相手倒した場合その限りではない',n): pass
        else: bad.append('（'+n+'）')
    return out,bad

# HPが変わる効果は、並びの順に処理される（反動のあとに反撃、など）。ほかの効果は、並びが違っても結果は同じ
SENSITIVE={'drain','recoil','selfDamage','selfAttack','selfKO','heal','onKill','counterOnSelfKO','ohko'}
def same_effects(a,b):
    key=lambda o:json.dumps(o,ensure_ascii=False,sort_keys=True)
    if sorted(map(key,a))!=sorted(map(key,b)): return False
    return [key(o) for o in a if o['op'] in SENSITIVE]==[key(o) for o in b if o['op'] in SENSITIVE]
def entries(monsters,skills):
    for m in monsters: yield f"M{m['id']:03d} {m['unique']['name']}", m['unique']
    for s in skills: yield f"W{s['id']+1:03d} {s['name']}", s
def check(monsters,skills):
    """text から作った効果と、いまの effects を比べる。戻り値：(違い, 読み取れなかった文)"""
    diff=[]; unparsed=[]
    for lab,u in entries(monsters,skills):
        ops,bad=parse(u['text'])
        if bad: unparsed.append((lab,bad))
        if not same_effects(ops,u['effects']): diff.append((lab,u['text'],ops,u['effects']))
    return diff,unparsed
if __name__=='__main__':
    d=sys.argv[sys.argv.index('--dir')+1] if '--dir' in sys.argv else 'data'
    M=json.load(open(f'{d}/monsters.json',encoding='utf8')); S=json.load(open(f'{d}/skills.json',encoding='utf8'))
    diff,un=check(M['monsters'],S['skills'])
    print(f'技の総数 200 / 文章から再現できた {200-len(diff)} / 違い {len(diff)} / 読み取れなかった文 {len(un)}')
    for lab,t,new,old in diff: print(f' {lab}\n   文: {t!r}\n   文章→{json.dumps(new,ensure_ascii=False)}\n   JSON→{json.dumps(old,ensure_ascii=False)}')
    for lab,b in un: print(' 読み取れない:',lab,b)
    if '--write' in sys.argv and not un:
        for m in M['monsters']: m['unique']['effects']=parse(m['unique']['text'])[0]
        for s in S['skills']: s['effects']=parse(s['text'])[0]
        json.dump(M,open(f'{d}/monsters.json','w',encoding='utf8'),ensure_ascii=False,indent=1); json.dump(S,open(f'{d}/skills.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
        print('書き換えました')
    sys.exit(1 if (diff or un) and '--check' in sys.argv else 0)
