# 固有モンスター（monster_list.xlsx の「固有モンスター」シート）→ data/uniques.json
# 使い方：python3 tests/import_uniques.py monster_list.xlsx data [--xlsx-out 直したExcel.xlsx]
#   ・No 100 は取り込まない（調整中）。書き方の例の行も取り込まない
#   ・固有技の効果の文章は、下の TEXT で「今までの形（1行＝1つの効果）」にそろえる（Excelにも書き戻せる）
#   ・効果のコード（effects）は、下の EFFECTS に、技の名前ごとに書く（文章から自動では作らない）
#   ・技A・技B は、技一覧の名前から、番号に直す
import json, sys, re, openpyxl

EL = {'火': 'fire', '風': 'wind', '土': 'earth', '水': 'water', '光': 'light', '闇': 'dark'}
TY = {'物理': 'phys', '魔法': 'mag'}
T3 = 1 / 3

def ex(el, ty, power, **kw): return {'op': 'extra', 'type': ty, 'power': power, 'el': el, **kw}
POST = 'postFoeHpHigher'   # 攻撃が終わった時点で、相手のHPが自分より多い

# 技の名前 → (効果の文章, 効果のコード)
SKILLS = {
 '神秘結界': ('必ず先攻になる\n相手の攻撃を無効化し、無効化した攻撃を、反動や追加効果もふくめて、コピーして追加で使う\nこの技は1度使うと2ターン使用できない',
   [{'op': 'forceFirst'}, {'op': 'nullifyFoe'}, {'op': 'copyFoe'}, {'op': 'cooldown', 'n': 2}]),
 'ミステリアス・ジュエルバリア': ('必ず先攻になる\n相手の攻撃を無効化し、無効化した攻撃を、反動や追加効果もふくめて、コピーして追加で使う',
   [{'op': 'forceFirst'}, {'op': 'nullifyFoe'}, {'op': 'copyFoe'}]),   # No100用（取り込まない。文章だけ直す）
 '真・神秘結界': ('必ず先攻になる\n相手の攻撃を無効化し、無効化した攻撃を、追加効果もふくめて、コピーして追加で使う\nただし反動は無効化する\nこの技は1度使うと2ターン使用できない',
   [{'op': 'forceFirst'}, {'op': 'nullifyFoe'}, {'op': 'copyFoe', 'noRecoil': True}, {'op': 'cooldown', 'n': 2}]),
 'もふもふ大結界': ('必ず後攻になる\nこのターンに受けた相手の攻撃を、追加効果もふくめて、コピーして追加で使う\n与えたダメージの1/3のHPを回復する\n次のターンに受けるダメージを半減する',
   [{'op': 'forceLast'}, {'op': 'copyFoe', 'cond': 'foeHit'}, {'op': 'drain', 'ratio': T3, 'post': True}, {'op': 'nextHalf'}]),
 'スチーム・ブレス': ('必ず後攻になる\nこの攻撃は打ち消されることはない\n相手に水属性威力50の追加物理攻撃と火属性威力50の追加物理攻撃\nこのターンの相手の攻撃が水か火ならば、次のターンの攻撃の威力+100',
   [{'op': 'forceLast'}, {'op': 'unblockable'}, ex('water', 'phys', 50), ex('fire', 'phys', 50),
    {'op': 'nextPower', 'n': 100, 'cond': 'foeSkillEl:water'}, {'op': 'nextPower', 'n': 100, 'cond': 'foeSkillEl:fire'}]),
 'グラン・オペラ・ファンタジア': ('この攻撃は打ち消されることはない\n相手に光属性威力60の追加魔法攻撃\n先攻なら、相手のHPが自分より多ければ、さらに威力60の風属性追加魔法攻撃\nこのターンに与えたダメージの1/3のHPを回復する',
   [{'op': 'unblockable'}, ex('light', 'mag', 60), ex('wind', 'mag', 60, cond=['first', 'foeHpHigher']), {'op': 'drain', 'ratio': T3}]),
 '大洋の白き災厄': ('与えたダメージの半分のダメージを受ける\n攻撃後、相手に水属性威力100の追加物理攻撃を行う\nこの時、相手のHPが自分より多ければ、この追加攻撃で与えたダメージの半分のHPを回復する',
   [{'op': 'recoil', 'ratio': 0.5, 'excludeExtras': True}, ex('water', 'phys', 100, tag='x'), {'op': 'drain', 'ratio': 0.5, 'of': 'x', 'cond': POST}]),
 '九連狐火': ('相手に闇属性威力90の追加魔法攻撃\n攻撃後、相手のHPが自分より多ければ、HPを900回復し、相手に900ダメージ与える',
   [ex('dark', 'mag', 90), {'op': 'heal', 'n': 900, 'cond': POST}, {'op': 'foeDamage', 'n': 900, 'cond': POST}]),
 '神威・天照太陽焔': ('必ず先攻になる\n相手に風属性威力60の追加物理攻撃と光属性威力70の追加魔法攻撃\n攻撃後、相手のHPが自分より多ければ、HPを300回復し、このターン受けるダメージを半分にする',
   [{'op': 'forceFirst'}, ex('wind', 'phys', 60), ex('light', 'mag', 70), {'op': 'heal', 'n': 300, 'cond': POST}, {'op': 'halfNow', 'cond': POST}]),
 'オーバードライブ・バースト': ('相手に光属性威力70の追加物理攻撃と火属性威力70の追加魔法攻撃\n攻撃後、相手のHPが自分より多ければ、HPを300回復する',
   [ex('light', 'phys', 70), ex('fire', 'mag', 70), {'op': 'heal', 'n': 300, 'cond': POST}]),
 '極光天翔': ('相手に光属性威力60の追加物理攻撃\n攻撃後、相手のHPが自分より多ければ、さらに威力60の光属性追加魔法攻撃を与え、この追加攻撃で与えたダメージ分のHPを回復する',
   [ex('light', 'phys', 60), ex('light', 'mag', 60, cond='afterFoeHpHigher', tag='x'), {'op': 'drain', 'ratio': 1, 'of': 'x'}]),
 'テンタクル・テンペスト': ('相手に水属性威力80の追加物理攻撃と風属性威力80の追加物理攻撃\n攻撃後、相手のHPが自分より多ければ、さらに威力80の闇属性追加物理攻撃',
   [ex('water', 'phys', 80), ex('wind', 'phys', 80), ex('dark', 'phys', 80, cond='afterFoeHpHigher')]),
 'おやすみハグ': ('相手のHP分のダメージを受ける\nこの技の効果で自分が受けたダメージの9/10のダメージを与える\nこの技の効果で与えたダメージの1/3のHPを回復する\n次のターン必ず後攻になる',
   [{'op': 'selfDamageFoeHp'}, {'op': 'foeDamageSelfTaken', 'ratio': 0.9}, {'op': 'drain', 'ratio': T3, 'of': 'fixed'}, {'op': 'nextLast'}]),
 '終焉黙示録\u3000魔降炎': ('相手に闇属性威力100の追加物理攻撃と光属性威力50の追加魔法攻撃\n次のターン行動ができない\n次のターン受けるダメージが2/3になる',
   [ex('dark', 'phys', 100), ex('light', 'mag', 50), {'op': 'selfStun'}, {'op': 'nextTake', 'mult': 2 / 3}]),
 'ロイヤルファング': ('攻撃後、素早さを攻撃力に変換し、威力90の風属性追加物理攻撃\n攻撃後、相手のHPが自分より多ければ、さらに威力50の闇属性追加物理攻撃',
   [ex('wind', 'phys', 90, stat='spd'), ex('dark', 'phys', 50, cond='afterFoeHpHigher')]),
 '黄泉帰還': ('必ず後攻になる\n先攻の相手の攻撃で倒された場合、倒されずに、相手のHPを半分にし、自分のHPを半分まで回復して、そのまま攻撃する\nこの攻撃で相手を倒した場合、HPを1000回復する',
   [{'op': 'forceLast'}, {'op': 'revive', 'foeCut': 0.5, 'heal': 0.5}, {'op': 'onKill', 'heal': 1000}]),
 'ぷるぷるボディ': ('先攻なら、次のターン受けるダメージが1/3になる\n後攻なら、受けた攻撃の威力分、自分の攻撃の威力を増加する\n攻撃後、相手のHPが自分より多ければ、与えたダメージの1/3のHPを回復する',
   [{'op': 'nextTake', 'mult': T3, 'cond': 'first'}, {'op': 'bonus', 'power': 'foe', 'cond': 'last'}, {'op': 'drain', 'ratio': T3, 'cond': POST}]),
 'シュレーディンガー・パンドラ': ('必ず先攻になる\n相手の技の効果を無効化し、通常の威力の攻撃にする\n相手の技の効果に回復が含まれている場合、本来回復するはずだったHP分、自分のHPを回復する\n追加効果がない技だった場合、自分のHPの半分のダメージを相手に与える',
   [{'op': 'forceFirst'}, {'op': 'negateFoeEffects'}, {'op': 'foeNoEffectDamage', 'ratio': 0.5}]),
 '酒呑狂乱・百鬼夜行': ('与えたダメージの半分のダメージを受ける\n相手に火属性威力70の追加物理攻撃と土属性威力50の追加物理攻撃\n次のターン行動ができない\n次のターン受けるダメージが1/3になる',
   [{'op': 'recoil', 'ratio': 0.5, 'excludeExtras': True}, ex('fire', 'phys', 70), ex('earth', 'phys', 50), {'op': 'selfStun'}, {'op': 'nextTake', 'mult': T3}]),
 '偽ノ奇跡・天火降臨': ('相手に土属性威力60の追加魔法攻撃と火属性威力60の追加魔法攻撃\n次のターンの攻撃の威力を60上げる',
   [ex('earth', 'mag', 60), ex('fire', 'mag', 60), {'op': 'nextPower', 'n': 60}]),
 '獣覇権666': ('相手に水属性威力60の追加物理攻撃\n相手に666ダメージ\n自分に666ダメージ',
   [ex('water', 'phys', 60), {'op': 'foeDamage', 'n': 666}, {'op': 'selfDamage', 'n': 666}]),
 '終末黙示': ('相手に風属性威力130の追加物理攻撃と火属性威力130の追加物理攻撃\n次のターン行動ができない\n次のターン受けるダメージが倍になる',
   [ex('wind', 'phys', 130), ex('fire', 'phys', 130), {'op': 'selfStun'}, {'op': 'nextDouble'}]),
}
NAME_FIX = {'リングカーカーバンクル': 'リングカーバンクル'}   # 名前の誤字

def main():
    xl, out = sys.argv[1], sys.argv[2]
    xl_out = sys.argv[sys.argv.index('--xlsx-out') + 1] if '--xlsx-out' in sys.argv else None
    S = json.load(open(f'{out}/skills.json', encoding='utf8'))['skills']
    sid = {s['name']: i for i, s in enumerate(S)}
    wb = openpyxl.load_workbook(xl); ws = wb['固有モンスター']
    mons, unknown = [], set()
    for row in ws.iter_rows(min_row=2):
        v = [c.value for c in row]
        if v[0] is None: continue
        if v[1] in NAME_FIX: row[1].value = v[1] = NAME_FIX[v[1]]
        sk = v[9]
        if sk not in SKILLS: unknown.add(sk); continue
        text, eff = SKILLS[sk]
        if v[13] != text: row[13].value = text        # 文章を、今までの形（1行＝1つの効果）にそろえる
        note = str(v[19] or '')
        if v[0] == 100 or note.startswith('←これは書き方の例'): continue   # No100と、書き方の例の行は、取り込まない
        mons.append({
            'id': int(v[0]), 'name': v[1], 'el': EL[v[2]],
            'stats': {'hp': int(v[3]), 'atk': int(v[4]), 'mat': int(v[5]), 'spd': int(v[6])},
            'res': {'phys': float(v[7]), 'mag': float(v[8])},
            'unique': {'name': sk, 'el': EL[v[10]], 'type': TY[v[11]], 'power': int(v[12]), 'effects': eff, 'text': text},
            'skills': [sid[v[17]], sid[v[18]]],      # 技A・技B（skills.json の番号）
            'desc': v[14] or '', 'image': f'images/monsters/M{int(v[0])}_F.png', 'note': note,
        })
    if unknown: raise SystemExit(f'効果のコードが未登録の固有技：{sorted(unknown)}')
    ids = [m['id'] for m in mons]
    if len(ids) != len(set(ids)): raise SystemExit(f'番号が重複：{sorted({i for i in ids if ids.count(i) > 1})}')
    json.dump({'version': 1, 'monsters': sorted(mons, key=lambda m: m['id'])}, open(f'{out}/uniques.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(f'固有モンスター {len(mons)} 体 → {out}/uniques.json')
    if xl_out: wb.save(xl_out); print('直したExcel →', xl_out)

if __name__ == '__main__': main()
