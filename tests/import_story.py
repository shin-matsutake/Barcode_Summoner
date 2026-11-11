# Excel（台本）→ data/story.json
# 使い方: python3 tests/import_story.py <台本.xlsx> [出力ファイル(省略時 data/story.json)] [--sheets 一幕,二幕] [--bump]
#   --sheets … 読み込むシートの名前（省略時は「一幕」だけ。途中のシートは入れない）。幕の番号は、並べた順（act1, act2…）
#   --bump   … version.json の番号を1つ上げる（端末に古いデータが残らないように）
# 列の並び：A=NO. B=話者 C=ト書き D=セリフ E=画像 F=音声。「NO.」の行より上は、登場人物の一覧（B=呼び名 D=説明）
# 表記ゆれの直し：話者の別名（ALIAS）、音声ID・NO.の特殊な下線（‗）を、ふつうの下線（_）にそろえる
import sys, re, json, os
from openpyxl import load_workbook
ALIAS = {'コウタ': 'ボク'}                                  # 台本の表記ゆれ（話者の名前）
DISPLAY = {'オウサマ': '王様', 'センセイ': '先生'}           # 名前欄に出す名前（ないものは、呼び名のまま）
# 幕の最後のバトル（なければ、バトルなし）。mine＝貸し出すモンスター、foe＝相手（13桁の番号）、ai＝相手の考え方（1〜4）、labels＝HUDの名前
BATTLE = {'一幕': {'mine': ['4165334556923'], 'foe': ['4506351352363'], 'ai': 1, 'labels': {'a': 'ボク', 'b': 'ノマン'}}}
SIDE = {'オウサマ': 'R', 'ノマン': 'R', 'バナド': 'R', 'フウマ': 'L', 'カゲツ': 'L', 'ミズキ': 'L', 'ダイチ': 'L', 'センセイ': 'L'}   # 立ち絵の位置（ボクは、立ち絵なし＝null）
norm_id = lambda s: re.sub(r'[^0-9A-Za-z]+', '_', str(s or '').strip()).strip('_')
S = lambda v: ('' if v is None else str(v)).strip()
def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; flags = [a for a in sys.argv[1:] if a.startswith('--')]
    if not args: print(__doc__); sys.exit(1)
    xlsx = args[0]; out = args[1] if len(args) > 1 else 'data/story.json'
    sheets = ['一幕']
    for i, a in enumerate(sys.argv):
        if a == '--sheets': sheets = sys.argv[i + 1].split(',')
    wb = load_workbook(xlsx, data_only=True); cast = {}; acts = []
    for n, name in enumerate(sheets, 1):
        ws = wb[name]; header = None
        for ri, r in enumerate(ws.iter_rows(values_only=True), 1):
            if S(r[0]) == 'NO.': header = ri; break
            if len(r) > 3 and S(r[1]) and S(r[3]) and n == 1:   # 登場人物の一覧
                who = ALIAS.get(S(r[1]), S(r[1])); cast[who] = {'display': DISPLAY.get(who, who), 'side': SIDE.get(who), 'role': S(r[3])}
        lines = []
        for ri, r in enumerate(ws.iter_rows(min_row=header + 1, values_only=True), header + 1):
            if not S(r[0]): continue
            who = ALIAS.get(S(r[1]), S(r[1]))
            if who and who not in cast: cast[who] = {'display': DISPLAY.get(who, who), 'side': SIDE.get(who), 'role': ''}
            lines.append({'id': norm_id(r[0]), 'who': who, 'note': S(r[2]), 'text': S(r[3]), 'img': S(r[4]), 'voice': norm_id(r[5])})
        act = {'id': f'act{n}', 'title': name, 'lines': lines}
        if name in BATTLE: act['battle'] = BATTLE[name]
        acts.append(act)
    data = {'cast': cast, 'acts': acts}
    old = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else None
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'登場人物 {len(cast)} / 幕 {len(acts)} / セリフ {[len(a["lines"]) for a in acts]} → {out}', '（変更あり）' if old != data else '（変更なし）')
    if '--bump' in flags and old != data:
        vp = os.path.join(os.path.dirname(out), 'version.json'); v = json.load(open(vp)); v['version'] += 1; json.dump(v, open(vp, 'w')); print('version →', v['version'])
main()
