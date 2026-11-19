// 音：BGM・効果音（SE）。音のファイルは、sound/ の下（BGM/…、se/…）
//   ・最初の画面で「音を出す／消音」を選ぶ（setSound）。消音のあいだは、どの音も鳴らさない
//   ・BGM は <audio> を1つだけ使い回す（iPhone でも、最初のタップのあとなら、曲を切り替えられる）
//   ・SE は Web Audio（すぐ鳴る）。音のファイルは、すべて .mp3
// ---- ここから下の「決めごと」は、ブラウザなしでもテストできる ----
export const SE_TIER_EDGES = [0.2, 0.4, 0.6];   // ダメージが相手の最大HPの何割か：2割未満＝1／2割以上＝2／4割以上＝3／6割以上＝4
export const damageTier = (dmg, maxHp) => {
  const r = maxHp > 0 ? dmg / maxHp : 0;
  return r >= SE_TIER_EDGES[2] ? 4 : r >= SE_TIER_EDGES[1] ? 3 : r >= SE_TIER_EDGES[0] ? 2 : 1;
};
export const attackSeKey = (type, tier) => `se/${type === 'mag' ? 'Magic' : 'Physical'}_${tier}`;   // 魔法＝Magic_1〜4／物理＝Physical_1〜4
export const summonSeKey = (luckTier, unique = false) => `se/summon_0${unique ? 5 : Math.max(0, Math.min(3, luckTier)) + 1}`;   // 運 低〜最高＝01〜04／固有＝05
export const BATTLE_TRACKS = 9;   // BGM_01〜BGM_09
export const battleBgmKey = n => `BGM/BGM_0${n}`;
export const pickBattleN = (prev = 0, rand = Math.random) => { let n; do n = 1 + Math.floor(rand() * BATTLE_TRACKS); while (n === prev && BATTLE_TRACKS > 1); return n; };
// 画面ごとのBGM。null＝いま鳴っている曲のまま。チュートリアル（物語とバトル）は ccl
export function bgmFor(screen, params = {}) {
  if (screen === 'soundGate') return null;
  if (screen === 'story') return 'BGM/ccl';   // いまの物語は、チュートリアルだけ（タワーの物語ができたら、tower_talk を使い分ける）
  if (screen === 'match') return params.kind === 'tutorial' ? 'BGM/ccl' : 'battle';
  if (screen === 'tower' || screen === 'towerRoster' || screen === 'towerAdd') return 'BGM/tower';
  if (screen === 'select' && params.mode !== 'code') return 'BGM/tower';   // タワーの出撃えらび
  return 'BGM/Menu';
}

// ---- ここから下は、ブラウザの中だけで動く ----
let on = true, volSource = () => ({ bgm: 70, se: 70 }), live = {};
export const soundOn = () => on;
export const setVolumeSource = fn => { volSource = fn; };
export const setLiveVolume = (k, v) => { live[k] = v; applyBgm(); };   // オプションでスライダーを動かしているあいだ
export const clearLiveVolume = () => { live = {}; };
const vol = k => Math.max(0, Math.min(1, ((live[k] != null ? live[k] : (volSource() || {})[k]) || 0) / 100));
export const setSound = v => { on = !!v; if (on) ac(); applyBgm(); };

const HAS = typeof window !== 'undefined' && typeof Audio !== 'undefined';
const fileUrl = key => `sound/${key}.mp3`;

let actx = null; const bufs = new Map();
function ac() {
  if (!HAS) return null;
  if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) { try { actx = new C(); } catch (e) { actx = null; } } }
  if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}
function buffer(key) {
  if (!bufs.has(key)) {
    const p = fetch(fileUrl(key)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(b => new Promise((ok, ng) => ac().decodeAudioData(b, ok, ng)));
    bufs.set(key, p); p.catch(() => bufs.delete(key));
  }
  return bufs.get(key);
}
export async function playSe(key) {
  if (!HAS || !on || !vol('se')) return;
  try {
    const c = ac(); if (!c) return;
    const b = await buffer(key), g = c.createGain(), s = c.createBufferSource();
    g.gain.value = vol('se'); s.buffer = b; s.connect(g); g.connect(c.destination); s.start();
  } catch (e) { /* 音が鳴らなくても、ゲームは続ける */ }
}
export const playAttackSe = (type, dmg, maxHp) => playSe(attackSeKey(type, damageTier(dmg, maxHp)));
export const playSummonSe = (luckTier, unique) => playSe(summonSeKey(luckTier, unique));

let bgmEl = null, bgmKey = null, bgmWant = null, lastBattle = 0;
function applyBgm() {
  if (!HAS) return;
  if (!bgmEl) { bgmEl = new Audio(); bgmEl.loop = true; bgmEl.preload = 'auto'; }
  if (!on || !bgmWant || !vol('bgm')) { bgmEl.pause(); return; }
  if (bgmKey !== bgmWant) { bgmKey = bgmWant; bgmEl.src = fileUrl(bgmWant); }
  bgmEl.volume = vol('bgm');
  if (bgmEl.paused) bgmEl.play().catch(() => {});
}
export function stopBgm() { bgmWant = null; applyBgm(); }   // 決着のジングルのあいだなど、BGMを止める（次の画面で、また鳴る）
export function playBgm(key) {   // key: 'BGM/Menu' など。'battle' なら、バトルの曲を、前回とは別のものからランダムに
  if (key === 'battle') { lastBattle = pickBattleN(lastBattle); key = battleBgmKey(lastBattle); }
  bgmWant = key; applyBgm();
}
