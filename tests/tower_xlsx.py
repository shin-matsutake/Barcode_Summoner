#!/usr/bin/env python3
"""タワー管理表（Excel）⇔ data/tower.json

使い方（リポジトリ直下で）
  python3 tests/tower_xlsx.py template タワー管理表.xlsx   いまの tower.json から、管理表の元を作る（上書きしない）
  python3 tests/tower_xlsx.py import   タワー管理表.xlsx   管理表から data/tower.json を作り、敵の強さを測って、
                                                            「確認(自動)」「敵の一覧(自動)」のシートに書く
    オプション  --no-rate  強さの測定をしない（速い）／ --n 60  通過率の試行回数／ --no-bump  データの版を上げない

管理表で直すのは、黄色いセルだけ（使い方シートに、くわしく書いてある）。
測定は tests/rate_tower.mjs（Node）がやる。
"""
import json, os, subprocess, sys
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule

TOWER = 'data/tower.json'
VERSION = 'data/version.json'
RATING = '/tmp/tower_rating.json'
S_USAGE, S_STAGE, S_TEAM, S_UNIQ, S_GUIDE, S_CHECK, S_LIST = '使い方', 'ステージ', '敵チーム', '固有モンスター(準備中)', '強さの目安', '確認(自動)', '敵の一覧(自動)'
MAX_STAGE, PATTERNS = 26, 3
TIERS = ['平均', '上位30%', '上位10%', '上位3%', '上位1%']
AI_LABELS = {1: 'ランダム', 2: '威力重視', 3: 'ダメージ予測', 4: '慎重'}
EL_JA = {'fire': '火', 'water': '水', 'earth': '土', 'wind': '風', 'light': '光', 'dark': '闇'}
ROW_MAX_TEAM, ROW_MAX_STAGE = 200, 60   # 数式が見る行の範囲（行を足しても、ここまでは数える）

# ---- 初期値（たたき台。tests のスクリプトで測った強さの試算にもとづく。管理表で自由に直す） ----
def default_plan():
    """階層 → (持ち込み, 戦う, AI, 狙う強さ, ボス, 想定する層, メモ)"""
    p = {1: (1, 1, 1, .38, False, '平均', ''), 2: (3, 1, 1, .50, False, '平均', ''), 3: (3, 2, 1, .58, False, '平均', ''),
         4: (3, 3, 1, .66, False, '平均', ''), 5: (5, 3, 1, .75, True, '平均', '第1章のボス')}
    for s, e in zip(range(6, 10), (.76, .77, .78, .79)): p[s] = (5, 3, 2, e, False, '上位30%', '')
    p[10] = (5, 3, 2, .84, True, '上位30%', '第2章のボス')
    for s, e in zip(range(11, 15), (.82, .83, .84, .85)): p[s] = (5, 4, 3, e, False, '上位10%', '')
    p[15] = (5, 4, 3, .90, True, '上位10%', '第3章のボス')
    for s, e in zip(range(16, 20), (.88, .89, .90, .91)): p[s] = (5, 4, 3, e, False, '上位10%', '')
    p[20] = (5, 4, 3, .95, True, '上位10%', '第4章のボス')
    for s, e in zip(range(21, 25), (.93, .94, .945, .95)): p[s] = (5, 5, 3, e, False, '上位3%', '')
    p[25] = (5, 5, 3, .97, True, '上位3%', '第5章のボス（強さ97%以上の個体は少ないので、固有モンスターで補う）')
    p[26] = (5, 5, 4, .98, True, '上位1%', '裏ボス（25階層のクリア後）')
    return p

# ---- 見た目 ----
FONT = 'Arial'
f_norm, f_bold = Font(name=FONT, size=10), Font(name=FONT, size=10, bold=True)
f_head = Font(name=FONT, size=10, bold=True, color='FFFFFF')
f_title = Font(name=FONT, size=14, bold=True)
f_note = Font(name=FONT, size=9, color='666666')
fill_head = PatternFill('solid', fgColor='1F4E78')
fill_in = PatternFill('solid', fgColor='FFF8DC')     # 入力するセル（黄）
fill_auto = PatternFill('solid', fgColor='EDEDED')   # 自動で入るセル（灰）
fill_bad, fill_warn, fill_ok = PatternFill('solid', bgColor='F8CBAD', fgColor='F8CBAD'), PatternFill('solid', bgColor='FFE699', fgColor='FFE699'), PatternFill('solid', bgColor='C6E0B4', fgColor='C6E0B4')
wrap = Alignment(wrap_text=True, vertical='top')


def col(i):
    from openpyxl.utils import get_column_letter
    return get_column_letter(i)


def setw(ws, widths):
    for i, w in enumerate(widths, 1): ws.column_dimensions[col(i)].width = w


def head(ws, row, labels, fills=None):
    for i, t in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=t); c.font, c.fill = f_head, fill_head
        c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')


def jan_text(v):
    """セルの値を、13桁の番号（または固有ID）の文字にする。数字になっていて先頭の0が消えたものは、補う"""
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): v = int(v)
    if isinstance(v, int): return str(v).zfill(13)
    return str(v).strip()


def check_digit_ok(j):
    if len(j) != 13 or not j.isdigit(): return False
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(j[:12]))
    return (10 - s % 10) % 10 == int(j[12])


# ============================== 管理表の元を作る ==============================
def build_template(path):
    tower = json.load(open(TOWER, encoding='utf-8')) if os.path.exists(TOWER) else {'stages': []}
    cur = {s['stage']: s for s in tower['stages']}
    plan = default_plan()
    wb = Workbook(); wb.remove(wb.active)
    for name in (S_USAGE, S_STAGE, S_TEAM, S_UNIQ, S_GUIDE, S_CHECK, S_LIST): wb.create_sheet(name)

    # ---- ステージ ----
    ws = wb[S_STAGE]
    heads = ['階層', '章・メモ', 'ボス', '持ち込み', '戦う', '敵のAI', '狙う強さ', '想定する層', '敵キャラ名', '敵の立ち絵', '前の文1', '前の文2', '前の文3', '後の文1', '後の文2', '後の文3', 'チーム数(自動)', 'チェック(自動)']
    head(ws, 1, heads); setw(ws, [6, 24, 6, 8, 6, 8, 9, 12, 14, 18, 28, 28, 28, 28, 28, 28, 10, 28]); ws.row_dimensions[1].height = 30
    for s in range(1, MAX_STAGE + 1):
        r = s + 1; bring, fight, ai, target, boss, tier, memo = plan[s]
        st = cur.get(s)
        if st: bring, fight, ai, boss = st['rule']['bring'], st['rule']['fight'], st.get('ai', 1), bool(st.get('boss', boss))
        foe = (st or {}).get('foe') or {}
        intro = list((st or {}).get('intro') or []) if not isinstance((st or {}).get('intro'), str) else [st['intro']]
        outro = list((st or {}).get('outro') or []) if not isinstance((st or {}).get('outro'), str) else [st['outro']]
        vals = [s, memo, '○' if boss else '', bring, fight, ai, target, tier, foe.get('name', ''), foe.get('image', '')] + (intro + ['', '', ''])[:3] + (outro + ['', '', ''])[:3]
        for i, v in enumerate(vals, 1):
            c = ws.cell(row=r, column=i, value=v if v != '' else None); c.font = f_norm
            if i > 1: c.fill = fill_in
            if i >= 11 or i == 2: c.alignment = wrap
        ws.cell(row=r, column=7).number_format = '0.0%'
        a = ws.cell(row=r, column=1); a.font = f_bold
        ws.cell(row=r, column=17, value=f"=SUMPRODUCT(('{S_TEAM}'!$A$2:$A${ROW_MAX_TEAM}=A{r})*('{S_TEAM}'!$I$2:$I${ROW_MAX_TEAM}=\"OK\"))")
        ws.cell(row=r, column=18, value=f'=IF(E{r}>D{r},"戦う数が持ち込み数より多い",IF(Q{r}=0,"敵チーム未入力",IF(Q{r}<3,"パターンが"&Q{r}&"つだけ（3つ推奨）","OK")))')
        for i in (17, 18): ws.cell(row=r, column=i).font, ws.cell(row=r, column=i).fill = f_norm, fill_auto
    ws.freeze_panes = 'C2'
    dv = DataValidation(type='list', formula1='"1,2,3,4"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'F2:F{MAX_STAGE + 1}')
    dv = DataValidation(type='list', formula1='"' + ','.join(TIERS) + '"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'H2:H{MAX_STAGE + 1}')
    dv = DataValidation(type='list', formula1='"○"', allow_blank=True); ws.add_data_validation(dv); dv.add(f'C2:C{MAX_STAGE + 1}')
    dv = DataValidation(type='whole', operator='between', formula1='1', formula2='5', allow_blank=True); ws.add_data_validation(dv); dv.add(f'D2:E{MAX_STAGE + 1}')
    ws.conditional_formatting.add(f'R2:R{MAX_STAGE + 1}', FormulaRule(formula=['AND(R2<>"OK",R2<>"")'], fill=fill_bad))

    # ---- 敵チーム ----
    wt = wb[S_TEAM]
    head(wt, 1, ['階層', 'パターン', '敵1', '敵2', '敵3', '敵4', '敵5', 'メモ', 'チェック(自動)', '確1', '確2', '確3', '確4', '確5'])
    setw(wt, [6, 8, 16, 16, 16, 16, 16, 22, 26, 5, 5, 5, 5, 5]); wt.row_dimensions[1].height = 30
    for s in range(1, MAX_STAGE + 1):
        teams = (cur.get(s) or {}).get('teams') or []
        for pn in range(1, PATTERNS + 1):
            r = 2 + (s - 1) * PATTERNS + (pn - 1)
            wt.cell(row=r, column=1, value=s).font = f_bold; wt.cell(row=r, column=2, value=pn).font = f_norm
            members = teams[pn - 1] if pn - 1 < len(teams) else []
            for k in range(5):
                c = wt.cell(row=r, column=3 + k, value=members[k] if k < len(members) else None)
                c.number_format = '@'; c.font = f_norm; c.fill = fill_in
            c = wt.cell(row=r, column=8); c.font, c.fill = f_norm, fill_in
    for r in range(2, ROW_MAX_TEAM + 1):
        for k in range(5): wt.cell(row=r, column=3 + k).number_format = '@'
        for k, cc in enumerate('CDEFG'):   # 番号のチェック：13桁・チェックディジット（最後の1桁）。Uで始まる＝固有モンスター
            x = f'{cc}{r}'
            wt.cell(row=r, column=10 + k, value=f'=IFERROR(IF({x}="","",IF(LEFT({x},1)="U","固有",IF(LEN({x})<>13,"×",IF(MOD(10-MOD(SUMPRODUCT(--MID({x},ROW($1:$12),1),{{1;3;1;3;1;3;1;3;1;3;1;3}}),10),10)=--RIGHT({x},1),"OK","×")))),"×")').font = f_note
        wt.cell(row=r, column=9, value=f'=IF(COUNTA(C{r}:G{r})=0,"",IF(COUNTIF(J{r}:N{r},"×")>0,"番号をたしかめてください",IF(COUNTIF(J{r}:N{r},"固有")>0,"固有を含む（ゲーム未対応）",IF(COUNTA(C{r}:G{r})<IFERROR(INDEX(\'{S_STAGE}\'!$D$2:$D${ROW_MAX_STAGE},MATCH(A{r},\'{S_STAGE}\'!$A$2:$A${ROW_MAX_STAGE},0)),0),"人数が足りない","OK"))))').font = f_norm
        wt.cell(row=r, column=9).fill = fill_auto
    for cc in 'JKLMN': wt.column_dimensions[cc].hidden = True
    wt.freeze_panes = 'C2'
    wt.conditional_formatting.add(f'I2:I{ROW_MAX_TEAM}', FormulaRule(formula=['AND(I2<>"OK",I2<>"")'], fill=fill_bad))

    # ---- 固有モンスター（準備中） ----
    wu = wb[S_UNIQ]
    head(wu, 1, ['ID', '名前', '属性', 'HP', '攻撃', '魔法攻撃', 'SPD', '物理耐性', '魔法耐性', '技A', '技B', '固有技', 'バトルの画像', '物語の立ち絵', 'メモ'])
    setw(wu, [8, 20, 8, 8, 8, 10, 8, 10, 10, 18, 18, 22, 18, 18, 40]); wu.row_dimensions[1].height = 30
    ex = ['U001', '（例）ミラージュナイト', '光', 5200, 480, 460, 380, 0.2, 0.2, '光の一閃', 'ゼニスシャイン', '（固有技の名前）', 'U001_F.png', 'U001.png', '（例）この行は例です。ゲーム側は、まだ固有モンスターに対応していません（準備中）']
    for i, v in enumerate(ex, 1):
        c = wu.cell(row=2, column=i, value=v); c.font = f_norm; c.fill = fill_in
    wu.cell(row=2, column=8).number_format = wu.cell(row=2, column=9).number_format = '0%'
    for r in range(3, 13):
        for i in range(1, 16): wu.cell(row=r, column=i).fill = fill_in
    wu.freeze_panes = 'C2'

    # ---- 強さの目安 ----
    wg = wb[S_GUIDE]; setw(wg, [18, 14, 14, 14, 14, 14, 40])
    wg['A1'] = '強さの目安（検討用。変えても、ゲームには影響しません）'; wg['A1'].font = f_title
    wg['A2'] = '出典：ランダムな12,000個のバーコードを実際に戦わせた試算（2026-11-14。tests/rate_tower.mjs と同じ物差し）。プレイヤーは、ダメージを読んで技を選ぶ想定。'; wg['A2'].font = f_note
    wg['A4'] = '① 個体の強さ（ランダムな相手に対する勝率）の分布'; wg['A4'].font = f_bold
    head(wg, 5, ['位置', '勝率', 'HP', '攻撃', '魔法攻撃', 'SPD', 'メモ'])
    rows = [('中央', .50, 3550, 305, 280, 280, '能力は、帯ごとの中央値'), ('上位30%', .67, 4450, 360, 335, 310, ''), ('上位10%', .83, 5150, 440, 400, 370, ''),
            ('上位3%', .92, 5400, 465, 455, 380, ''), ('上位1%', .95, 5750, 505, 475, 400, '97%以上は、全体の約0.35%しかいない（12,000個中42個）')]
    for i, row in enumerate(rows):
        for k, v in enumerate(row, 1):
            c = wg.cell(row=6 + i, column=k, value=v); c.font = f_norm
        wg.cell(row=6 + i, column=2).number_format = '0%'
    wg['A12'] = '② 5体で戦うときの、プレイヤーの勝率（敵のAI＝ダメージ予測）'; wg['A12'].font = f_bold
    head(wg, 13, ['敵の強さ', *TIERS, 'メモ'])
    tbl = [(.70, .24, .79, .94, .98, 1.0), (.80, .11, .50, .86, .93, .96), (.85, .02, .36, .67, .83, .92), (.90, .03, .21, .47, .74, .79), (.93, 0, .09, .31, .51, .71), (.96, 0, .07, .24, .45, .58), (.98, 0, .04, .11, .26, .45)]
    for i, row in enumerate(tbl):
        for k, v in enumerate(row, 1):
            c = wg.cell(row=14 + i, column=k, value=v); c.font = f_norm; c.number_format = '0%'
    wg['A22'] = '③ 仲間を集める手間（5体そろえるまでの、バーコードの読み取り回数の目安）'; wg['A22'].font = f_bold
    head(wg, 23, ['層', '回数'])
    for i, (a, b) in enumerate([('上位30%', 17), ('上位10%', 50), ('上位3%', 170), ('上位1%', 500)]):
        wg.cell(row=24 + i, column=1, value=a).font = f_norm; wg.cell(row=24 + i, column=2, value=b).font = f_norm
    wg['A29'] = '※ 属性や技の組み合わせの条件が付くと、回数はもっと増えます。階層ごとの狙いは、「ステージ」シートの「狙う強さ」「想定する層」に書きます。'; wg['A29'].font = f_note

    # ---- 確認・一覧（空。取り込みで入る） ----
    for name in (S_CHECK, S_LIST):
        w = wb[name]; w['A1'] = f'{name}：取り込み（import）のあとに、自動で入ります。ここは直さないでください。'; w['A1'].font = f_note

    write_usage(wb[S_USAGE])
    wb.move_sheet(S_USAGE, offset=-wb.index(wb[S_USAGE]))
    wb.save(path)


def write_usage(ws):
    ws.column_dimensions['A'].width = 110
    lines = [
        ('タワー管理表の使い方', f_title),
        ('', f_norm),
        ('■ 流れ', f_bold),
        ('① 黄色のセルを直します（灰色のセルは、自動で入るので、直しません）。', f_norm),
        ('② このファイルをClaudeに渡します（または、手元で  python3 tests/tower_xlsx.py import タワー管理表.xlsx  を実行）。', f_norm),
        ('③ data/tower.json が更新され、「確認(自動)」「敵の一覧(自動)」のシートに、敵の名前・能力・強さと、プレイヤーの層ごとの通過率が入ります。', f_norm),
        ('④ 更新されたzip（またはtower.json）をGitHubに上げて、ゲームで確かめます。確認済みのファイルが戻ってくるので、次はそれを直します。', f_norm),
        ('', f_norm),
        ('■ シートの役割', f_bold),
        ('ステージ … 階層ごとのルール・敵のAI・狙う強さ・敵キャラの名前と立ち絵・物語の文（前／後）', f_norm),
        ('敵チーム … 階層ごと・パターンごとの、敵の顔ぶれ（敵1〜敵5。先頭から順に戦う）。1階層に、3パターンまで（ゲームが、そのうち1つをランダムに選ぶ）', f_norm),
        ('固有モンスター(準備中) … バーコードでは手に入らないモンスターの設計メモ。ゲーム側は、まだ対応していません（今は、取り込まれません）', f_norm),
        ('強さの目安 … 強さを決めるときの参考の表（試算）', f_norm),
        ('確認(自動)・敵の一覧(自動) … 取り込みのあとに、自動で入ります', f_norm),
        ('', f_norm),
        ('■ 入力のきまり', f_bold),
        ('・敵の番号は、13桁のバーコードの番号です（最後の1桁が正しくないと、「×」になります。先頭の0は消さないでください。セルは文字として扱います）。', f_norm),
        ('・固有モンスターは、番号の代わりに  U001  のように、Uで始まるIDを書く予定です（今は未対応で、そのパターンは出力されません）。', f_norm),
        ('・敵チームが1つもない階層は、ゲームに出ません（tower.json に書き出されません）。', f_norm),
        ('・持ち込み＝敵が連れてくる数（選出画面で、名前と属性が見える）。戦う＝実際に戦う数（先頭から）。戦う ≦ 持ち込み ≦ 5。', f_norm),
        ('・敵のAI：1＝ランダム／2＝威力重視／3＝ダメージ予測／4＝慎重（HPが減ると回復も考える）', f_norm),
        ('・文章は、1ページずつ別のセルに書きます（前の文1〜3、後の文1〜3）。タワーの物語は、まだ画面が簡易なので、立ち絵は、今は使われません（保存だけ）。', f_norm),
        ('・敵の立ち絵は、images/story/ に置いた画像のファイル名を書きます（例：noman.png）。', f_norm),
        ('', f_norm),
        ('■ 強さの考え方', f_bold),
        ('・狙う強さ＝敵1体あたりの、個体の強さ（ランダムな相手に対する勝率）の目標です。確認(自動)の「戦う顔ぶれの平均強さ」と比べられます。', f_norm),
        ('・想定する層＝その階層を、どの程度の仲間のチームで、クリアしてほしいか（平均／上位30%／上位10%／上位3%／上位1%）。', f_norm),
        ('・確認(自動)の「想定層の通過率」は、その層のチームが1回の挑戦で勝つ確率です。「ちょうどよい」の範囲は、確認(自動)の上のほうの黄色のセルで変えられます。', f_norm),
        ('・測定は、乱数を固定しているので、同じ内容なら、同じ結果になります。通過率の誤差は、約±6ポイントです（試行回数を増やすと小さくなります）。', f_norm),
        ('', f_norm),
        ('■ 色', f_bold),
        ('黄色＝直すセル／灰色＝自動で入るセル（直さない）／赤＝注意（番号が違う、人数が足りない、など）', f_norm),
    ]
    for i, (t, f) in enumerate(lines, 1):
        c = ws.cell(row=i, column=1, value=t); c.font = f; c.alignment = Alignment(wrap_text=True, vertical='top')


# ============================== 取り込み ==============================
def read_workbook(path):
    wb = load_workbook(path)
    errs, warns = [], []
    ws = wb[S_STAGE]; stages = {}
    for r in range(2, ws.max_row + 1):
        a = ws.cell(row=r, column=1).value
        if a in (None, ''): continue
        try: s = int(a)
        except Exception: errs.append(f'{S_STAGE} {r}行：階層が数字ではありません（{a!r}）'); continue
        v = lambda i: ws.cell(row=r, column=i).value
        def num(i, default):
            x = v(i)
            if x in (None, ''): return default
            try: return int(x)
            except Exception: errs.append(f'{S_STAGE} {r}行：{ws.cell(row=1, column=i).value}が数字ではありません（{x!r}）'); return default
        bring, fight, ai = num(4, 1), num(5, 1), num(6, 1)
        if s in stages: errs.append(f'{S_STAGE} {r}行：階層{s}が重複しています')
        if not 1 <= bring <= 5: errs.append(f'階層{s}：持ち込みは1〜5です（{bring}）')
        if not 1 <= fight <= bring: errs.append(f'階層{s}：戦う数は、1以上、持ち込み数以下です（持ち込み{bring}・戦う{fight}）')
        if ai not in AI_LABELS: errs.append(f'階層{s}：敵のAIは1〜4です（{ai}）')
        target = v(7)
        if isinstance(target, (int, float)) and target > 1: target = target / 100
        pages = lambda cols: [str(v(c)).strip() for c in cols if v(c) not in (None, '') and str(v(c)).strip()]
        stages[s] = dict(stage=s, memo=v(2) or '', boss=str(v(3) or '').strip() in ('○', '◯', 'O', 'o', '1', 'TRUE', 'True'), bring=bring, fight=fight, ai=ai,
                         target=target if isinstance(target, (int, float)) else None, tier=v(8) or '', foeName=str(v(9) or '').strip(), foeImage=str(v(10) or '').strip(),
                         intro=pages((11, 12, 13)), outro=pages((14, 15, 16)))
    wt = wb[S_TEAM]; teams = {}
    for r in range(2, wt.max_row + 1):
        a = wt.cell(row=r, column=1).value
        if a in (None, ''): continue
        try: s = int(a)
        except Exception: continue
        raw = [jan_text(wt.cell(row=r, column=3 + k).value) for k in range(5)]
        members = [x for x in raw if x]
        if not members: continue
        pn = wt.cell(row=r, column=2).value
        bad = [x for x in members if not (x[0] == 'U' or check_digit_ok(x))]
        if bad: errs.append(f'{S_TEAM} {r}行（階層{s}・パターン{pn}）：番号が正しくありません {bad}'); continue
        if any(x[0] == 'U' for x in members):
            warns.append(f'{S_TEAM} {r}行（階層{s}・パターン{pn}）：固有モンスターを含むので、ゲーム未対応のため出力しません'); continue
        if s not in stages: warns.append(f'{S_TEAM} {r}行：階層{s}が「{S_STAGE}」にないので、無視します'); continue
        teams.setdefault(s, []).append(members)
    return wb, stages, teams, errs, warns


def run_rating(n):
    cmd = ['node', 'tests/rate_tower.mjs', TOWER, RATING, str(n)]
    subprocess.run(cmd, check=True)
    return json.load(open(RATING, encoding='utf-8'))


def write_check(wb, stages, rating, params):
    for name in (S_CHECK, S_LIST):
        idx = wb.index(wb[name]); wb.remove(wb[name]); wb.create_sheet(name, idx)
    ws = wb[S_CHECK]
    ws['A1'] = '確認（自動）：取り込みのたびに、書き直されます。直さないでください。'; ws['A1'].font = f_title
    ws['A2'] = f"測定：ランダムなバーコード{rating['poolSize']}個を物差しにして、通過率は各{rating['seriesN']}回の試行（誤差は約±6ポイント）。プレイヤーは、ダメージを読んで技を選ぶ想定。"; ws['A2'].font = f_note
    ws['A3'] = '判定の範囲（通過率。黄色のセルは変えられます）'; ws['A3'].font = f_bold
    ws['A4'], ws['A5'] = '通常の階層', 'ボスの階層'
    for r, (lo, hi) in ((4, params['normal']), (5, params['boss'])):
        ws.cell(row=r, column=1).font = f_norm
        for cidx, v in ((2, lo), (3, hi)):
            c = ws.cell(row=r, column=cidx, value=v); c.number_format = '0%'; c.fill = fill_in; c.font = f_norm
    ws['D4'] = '← 下限（これより低いと「きびしめ」）／上限（これより高いと「やさしめ」）。数字は、目安としての仮の値です。'; ws['D4'].font = f_note
    heads = ['階層', 'パターン', 'ボス', '持ち込み/戦う', '敵のAI', '狙う強さ', '戦う顔ぶれの平均強さ', '差', '想定する層', *[f'通過率：{t}' for t in TIERS], '想定層の通過率', '判定']
    HR = 7
    head(ws, HR, heads); ws.row_dimensions[HR].height = 42
    # 通過率の列の見出しは、層の名前と一致させる（INDEX/MATCHで引くため、別の行に、名前だけを持つ）
    for k, t in enumerate(TIERS): ws.cell(row=HR - 1, column=10 + k, value=t).font = f_note
    ws.cell(row=HR - 1, column=9, value='（計算用）層の名前').font = f_note
    setw(ws, [8, 9, 6, 12, 14, 9, 14, 8, 12, 11, 11, 11, 11, 11, 12, 14])
    r = HR + 1
    for st in rating['stages']:
        m = stages[st['stage']]
        for t in st['teams']:
            vals = [st['stage'], t['idx'], '○' if m['boss'] else '', f"{st['bring']}/{st['fight']}", f"{st['ai']} {AI_LABELS[st['ai']]}", m['target'], t['teamE'], None, m['tier'] or None] + [t['pass'][x] for x in TIERS]
            for i, v in enumerate(vals, 1):
                c = ws.cell(row=r, column=i, value=v); c.font = f_norm
            ws.cell(row=r, column=6).number_format = ws.cell(row=r, column=7).number_format = '0%'
            for i in range(10, 15): ws.cell(row=r, column=i).number_format = '0%'
            ws.cell(row=r, column=8, value=f'=IF(F{r}="","",G{r}-F{r})').number_format = '+0%;-0%;0%'
            ws.cell(row=r, column=15, value=f'=IFERROR(INDEX(J{r}:N{r},MATCH(I{r},$J${HR - 1}:$N${HR - 1},0)),"")').number_format = '0%'
            ws.cell(row=r, column=16, value=f'=IF(O{r}="","",IF(O{r}<IF(C{r}="○",$B$5,$B$4),"きびしめ",IF(O{r}>IF(C{r}="○",$C$5,$C$4),"やさしめ","ちょうどよい")))')
            for i in (8, 15, 16): ws.cell(row=r, column=i).font = f_norm
            r += 1
    last = r - 1
    if last >= HR + 1:
        rng = f'P{HR + 1}:P{last}'
        ws.conditional_formatting.add(rng, FormulaRule(formula=[f'P{HR + 1}="ちょうどよい"'], fill=fill_ok))
        ws.conditional_formatting.add(rng, FormulaRule(formula=[f'OR(P{HR + 1}="きびしめ",P{HR + 1}="やさしめ")'], fill=fill_warn))
    ws.freeze_panes = f'C{HR + 1}'
    # 敵の一覧
    wl = wb[S_LIST]
    wl['A1'] = '敵の一覧（自動）：取り込みのたびに、書き直されます。直さないでください。'; wl['A1'].font = f_title
    head(wl, 3, ['階層', 'パターン', '順番', '戦う', '番号', '名前', '属性', 'HP', '攻撃', '魔法攻撃', 'SPD', '物理耐性', '魔法耐性', '技A', '技B', '固有技', '個体の強さ'])
    setw(wl, [6, 8, 6, 6, 16, 18, 6, 8, 8, 9, 8, 9, 9, 40, 40, 40, 10]); wl.row_dimensions[3].height = 30
    r = 4
    for st in rating['stages']:
        for t in st['teams']:
            for k, mem in enumerate(t['members'], 1):
                fights = k <= min(st['bring'], st['fight'])
                sk = (mem['skills'] + ['', '', ''])[:3]
                vals = [st['stage'], t['idx'], k, '○' if fights else '', mem['jan'], mem['name'], EL_JA.get(mem['el'], mem['el']), mem['hp'], mem['atk'], mem['mat'], mem['spd'], mem['physRes'], mem['magRes'], *[x.split('：', 1)[-1] for x in sk], mem['E']]
                for i, v in enumerate(vals, 1):
                    c = wl.cell(row=r, column=i, value=v); c.font = f_norm
                    if i in (5,): c.number_format = '@'
                for i in (12, 13, 17): wl.cell(row=r, column=i).number_format = '0%'
                r += 1
    wl.freeze_panes = 'E4'


def do_import(path, rate=True, n=60, bump=True):
    wb, stages, teams, errs, warns = read_workbook(path)
    if errs:
        print('直してほしい点があります。tower.json は、更新していません。')
        for e in errs: print('  ・' + e)
        sys.exit(1)
    out, empty = [], []
    for s in sorted(stages):
        if s not in teams: empty.append(s); continue
        m = stages[s]
        for i, tm in enumerate(teams[s], 1):
            if len(tm) < m['bring']: warns.append(f'階層{s}・パターン{i}：敵が{len(tm)}体で、持ち込み数（{m["bring"]}）より少ないです')
        o = {'stage': s, 'rule': {'bring': m['bring'], 'fight': m['fight']}, 'ai': m['ai']}
        if m['boss']: o['boss'] = True
        o['teams'] = teams[s]
        if m['intro']: o['intro'] = m['intro']
        if m['outro']: o['outro'] = m['outro']
        if m['foeName'] or m['foeImage']: o['foe'] = {'name': m['foeName'], 'image': m['foeImage']}
        out.append(o)
    if empty:   # 続いている階層は、まとめて1行にする
        runs, st = [], empty[0]
        for prev, cur in zip(empty, empty[1:] + [None]):
            if cur != prev + 1: runs.append((st, prev)); st = cur
        warns.append('階層' + '、'.join(f'{a}〜{b}' if a != b else str(a) for a, b in runs) + f'（{len(empty)}階層）：敵チームがないので、出力しません')
    new = json.dumps({'stages': out}, ensure_ascii=False, indent=1)
    old = open(TOWER, encoding='utf-8').read() if os.path.exists(TOWER) else ''
    changed = json.loads(old or '{"stages":[]}') != json.loads(new)
    open(TOWER, 'w', encoding='utf-8').write(new)
    print(f'tower.json を書きました：{len(out)}階層／{sum(len(o["teams"]) for o in out)}チーム（{"内容が変わりました" if changed else "内容は、前と同じです"}）')
    if changed and bump and os.path.exists(VERSION):
        v = json.load(open(VERSION)); v['version'] += 1; json.dump(v, open(VERSION, 'w')); print(f'データの版を上げました：v{v["version"]}')
    if rate and out:
        rating = run_rating(n)
        for st in rating['stages']:   # 同じ種類が、同じチームにいないか
            for t in st['teams']:
                ids = [m['speciesId'] for m in t['members'][:st['bring']]]
                if len(set(ids)) < len(ids): warns.append(f'階層{st["stage"]}・パターン{t["idx"]}：同じ種類のモンスターが、1つのチームにいます')
        params = {'normal': (.40, .75), 'boss': (.25, .60)}
        if S_CHECK in wb.sheetnames:   # 前に直した判定の範囲を、引き継ぐ
            w = wb[S_CHECK]
            try:
                for key, r in (('normal', 4), ('boss', 5)):
                    lo, hi = w.cell(row=r, column=2).value, w.cell(row=r, column=3).value
                    if isinstance(lo, (int, float)) and isinstance(hi, (int, float)): params[key] = (lo, hi)
            except Exception: pass
        write_check(wb, stages, rating, params)
        wb.save(path)
        print(f'確認のシートを書きました：{path}')
    for w in warns: print('注意：' + w)
    return warns


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == 'template':
        if os.path.exists(a[1]): sys.exit(f'{a[1]} がすでにあります（上書きしません）')
        build_template(a[1]); print('作りました：' + a[1])
    elif len(a) >= 2 and a[0] == 'import':
        n = int(a[a.index('--n') + 1]) if '--n' in a else 60
        do_import(a[1], rate='--no-rate' not in a, n=n, bump='--no-bump' not in a)
    else:
        print(__doc__)
