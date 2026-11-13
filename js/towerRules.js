// タワーの仲間のルール（画面を持たない。tests/tower.test.mjs でテストする）
//
//  ・仲間の枠は「いま進んでいるステージの番号」と同じ数（最大5）。ステージをクリアすると、1つ開く
//  ・空き枠があれば、いつでも召喚できる。いっぱいのときは、先に魔界に戻す
//  ・魔界に戻せるとき
//      ステージ1〜4 … 負けたあと（回数の制限なし）
//      ステージ5〜  … ステージの戦いが終わるたびに1回（勝っても負けても。使わなければ持ち越さない）
//  ・戻す回数・召喚した回数・ステージごとの勝ち方は、隠しボーナスの判定用に保存しておく
//
// tower の中身
//   cleared      クリアした最大のステージ番号
//   roster       仲間のJAN（最大5）
//   released     魔界に戻した回数の合計（ステージ1〜4も含む）
//   summoned     仲間に加えた回数の合計（ストックから加えた分も含む）
//   releasesLeft ステージ5〜で、いま戻せる回数
//   lost         ステージ1〜4で、負けたあとか（次の戦いが始まるまで）
//   foe          挑戦中のステージの相手チーム { stage, teamIdx }（クリアするまで固定）
//   records      ステージごとの、最後に勝ったときの出撃メンバー { '3': { party:[JAN], date } }

export const ROSTER_MAX = 5;
export const FREE_RELEASE_UNTIL = 4;   // ここまでのステージは、負けたあとだけ戻せる（回数の制限なし）
export const RELEASES_PER_STAGE = 1;   // それ以降は、戦いのあとに、この回数だけ戻せる

const isJan = j => typeof j === 'string' && /^\d{13}$/.test(j);
const nat = (v, max = 99999) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));

export const rosterCap = cleared => Math.min(ROSTER_MAX, nat(cleared) + 1);
export const progressStage = t => t.cleared + 1;   // いま進んでいる（次に挑戦する）ステージ
const chancesAfter = t => (progressStage(t) > FREE_RELEASE_UNTIL ? RELEASES_PER_STAGE : 0);

export const defaultTower = () => ({ cleared: 0, roster: [], released: 0, summoned: 0, releasesLeft: 0, lost: false, foe: null, records: {} });

// 保存データから読み込む（古いデータにない項目は、いまの進み具合から決める）
export function normalizeTower(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const t = defaultTower();
  t.cleared = nat(o.cleared, 99);
  t.roster = [...new Set(Array.isArray(o.roster) ? o.roster.filter(isJan) : [])].slice(0, ROSTER_MAX);
  t.released = nat(o.released);
  t.summoned = o.summoned == null ? t.roster.length : nat(o.summoned);
  t.releasesLeft = o.releasesLeft == null ? chancesAfter(t) : nat(o.releasesLeft, 9);
  t.lost = !!o.lost;
  if (o.foe && Number.isInteger(o.foe.stage) && Number.isInteger(o.foe.teamIdx) && o.foe.stage > 0 && o.foe.teamIdx >= 0) t.foe = { stage: o.foe.stage, teamIdx: o.foe.teamIdx };
  if (o.records && typeof o.records === 'object') {
    for (const [k, v] of Object.entries(o.records)) {
      if (/^\d{1,3}$/.test(k) && v && Array.isArray(v.party)) t.records[k] = { party: v.party.filter(isJan).slice(0, ROSTER_MAX), date: String(v.date || '') };
    }
  }
  return t;
}

// 魔界に戻せるか。mode: 'limited'（ステージ5〜。回数つき）／'free'（ステージ1〜4。負けたあとだけ）
export function releaseInfo(t) {
  const stage = progressStage(t);
  if (stage > FREE_RELEASE_UNTIL) return { can: t.releasesLeft > 0, mode: 'limited', left: t.releasesLeft, stage };
  return { can: !!t.lost, mode: 'free', left: Infinity, stage };
}

export const freeSlots = t => Math.max(0, rosterCap(t.cleared) - t.roster.length);

// 仲間を1体加える。枠が空いていなければ false
export function addToRoster(t, jan) {
  if (!isJan(jan) || t.roster.includes(jan) || freeSlots(t) <= 0) return false;
  t.roster.push(jan); t.summoned += 1;
  return true;
}

// 仲間を1体、魔界に戻す。戻せないときは false
export function releaseFromRoster(t, jan) {
  const r = releaseInfo(t);
  if (!t.roster.includes(jan) || !r.can) return false;
  t.roster = t.roster.filter(j => j !== jan);
  t.released += 1;
  if (r.mode === 'limited') t.releasesLeft = Math.max(0, t.releasesLeft - 1);
  return true;
}

// バトルが始まる：負けたあとの「戻せる」は、ここで終わる
export function startBattle(t) { t.lost = false; }

// バトルが終わった：勝ち負けを記録して、次に戻せる回数を決める
export function afterBattle(t, { stage, won, party = [], date = '' }) {
  if (won) {
    t.cleared = Math.max(t.cleared, stage);
    t.lost = false;
    if (t.foe && t.foe.stage === stage) t.foe = null;   // クリアしたので、次の挑戦では相手を引き直す
    t.records[String(stage)] = { party: party.filter(isJan).slice(0, ROSTER_MAX), date };
  } else t.lost = true;
  t.releasesLeft = chancesAfter(t);
}

// 画面に出す、魔界に戻せる状況の説明
export function releaseText(t) {
  const r = releaseInfo(t);
  if (r.mode === 'limited') return `魔界に戻せる回数：${r.left}回（ステージの戦いが終わると、1回に戻ります）`;
  return r.can ? '負けたあとなので、仲間を魔界に戻せます' : `ステージ${FREE_RELEASE_UNTIL}までは、負けたあとだけ魔界に戻せます`;
}
