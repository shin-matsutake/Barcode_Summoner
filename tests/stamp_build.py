# プログラムの版をつける：すべての JS の読み込み先・index.html の CSS/JS に ?v=<版> を付ける（スマホに古いファイルが残らないように）
# 使い方: python3 tests/stamp_build.py            … 版を1つ上げる（同じ日なら末尾の数字、日が変わっていたら 日付-1）
#         python3 tests/stamp_build.py 20261118-3  … 版を指定する
# 画像・音・data/ は対象外（data は version.json で別に管理）。公開（アップロード）の前に、毎回実行する
import re, sys, glob, os, datetime
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
vp = 'js/version.js'; cur = re.search(r"BUILD = '([^']+)'", open(vp, encoding='utf-8').read()).group(1)
today = datetime.date.today().strftime('%Y%m%d')
if len(sys.argv) > 1: new = sys.argv[1]
else:
    d, n = (cur.split('-') + ['0'])[:2]; new = f'{today}-{int(n) + 1}' if d == today else f'{today}-1'
IMP = re.compile(r"""(from\s+['"])(\.{1,2}/[^'"?]+\.js)(\?v=[^'"]*)?(['"])""")
changed = 0
for f in glob.glob('js/**/*.js', recursive=True):
    s = open(f, encoding='utf-8').read(); n = IMP.sub(lambda m: f'{m.group(1)}{m.group(2)}?v={new}{m.group(4)}', s)
    if f == vp: n = re.sub(r"BUILD = '[^']+'", f"BUILD = '{new}'", n)
    if n != s: open(f, 'w', encoding='utf-8').write(n); changed += 1
h = open('index.html', encoding='utf-8').read()
h2 = re.sub(r'(href="css/style\.css)(\?v=[^"]*)?"', rf'\1?v={new}"', h)
h2 = re.sub(r'(src="js/main\.js)(\?v=[^"]*)?"', rf'\1?v={new}"', h2)
if h2 != h: open('index.html', 'w', encoding='utf-8').write(h2); changed += 1
print(f'版 {cur} → {new}（書き換えたファイル {changed}）')
