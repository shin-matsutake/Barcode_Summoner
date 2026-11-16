# 試算・調整のスクリプト（tests/analysis）

リポジトリの**直下**で、`node tests/analysis/○○.mjs` のように実行する（保存場所は、`/tmp` を使う）。

| ファイル | 中身 | 先に必要なもの |
|---|---|---|
| `bigpool.mjs` | ランダムなバーコード3万個の「個体の強さ」（ランダムな相手への勝率）を測る → `/tmp/bigpool.json` | なし（約15秒） |
| `pool.mjs` | 同じく、個数と試合数を指定して測る（`node tests/analysis/pool.mjs 12000 60`）→ `/tmp/pool.json` | なし |
| `distribution.mjs` | 強さの分布と、帯ごとの能力の中央値。種ごとの強さ | `pool.json` |
| `tower_curve.mjs` | 敵の強さ×戦う数×プレイヤーの層（平均／上位30%／10%／3%／1%）ごとの勝率の表 | `pool.json` |
| `boss_strength.mjs` | 裏ボスの強さの目安（能力の倍率ごとの勝率） | `pool.json` |
| `ai_tournament.mjs` | CPUの考え方（AI）の総当たり。試作のAI（読み屋・均衡・石橋・癖読み・ミスつき）を含む | `bigpool.json` |
| `ai_type_check.mjs` | 物理・魔法の選び分けの正しさ（AIの段階ごと） | `bigpool.json` |
| `luck_rank_check.mjs` | 格・運が、実際の強さをどれくらい表すか | `bigpool.json` |
| `tutorial_pair.mjs` | チュートリアルの組み合わせ（ウルフ×ゴブリン）の勝率・ターン数を、技の選び方ごとに測る | なし |
| `fill_tower.mjs` ／ `calibrate_tower.py` | 強さの目標から、敵チーム（3パターン×5体）を自動で選ぶ／管理表に入れて、通過率が狙いに近づくよう目標を調整する（`python3 tests/analysis/calibrate_tower.py <回> <管理表.xlsx>`） | `bigpool.json`、管理表 |

- 乱数は固定してあるので、同じ内容なら、同じ結果になる。
- AIの試作（`ai_tournament.mjs`）は、ゲームには入っていない。実装するときの見本。
- 敵チームの測定は、`tests/rate_tower.mjs`（管理表の取り込み `tests/tower_xlsx.py` から呼ばれる）。
