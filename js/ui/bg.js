// 背景の切り替え（画面ごとに、images の画像を使い分ける）
//   画像がなければ、標準の背景（default）にもどる。標準もなければ、背景なし（CSSの模様だけ）
//   暗さは、style.css の #app[data-bg="…"] の --dim で決める
const FILES = {
  default: 'images/BARK.jpg',                 // 標準（トップ・ストックなど）
  tutorial: 'images/bg/tutorial.jpg',         // チュートリアルの物語
  towerMenu: 'images/bg/tower_menu.jpg',      // タワーの選択・準備・仲間の画面
  towerStory: 'images/bg/tower_story.jpg',    // タワーの物語（ステージの前後の文）
  towerBattle: 'images/bg/tower_battle.jpg',  // タワーのバトル
};
const cache = new Map();   // key → 読み込めたURL（なければ null）
let token = 0, current = 'default';

const load = key => {
  if (!cache.has(key)) cache.set(key, new Promise(res => {
    const im = new Image();
    im.onload = () => res(new URL(FILES[key], location.href).href);   // 画像の場所は、ページの場所が基準
    im.onerror = () => res(null);
    im.src = FILES[key];
  }));
  return cache.get(key);
};

// どの画面で、どの背景を使うか
export function bgFor(name, params = {}) {
  if (name === 'story') return 'tutorial';
  if (name === 'tower' || name === 'towerRoster' || name === 'towerAdd') return 'towerMenu';
  if (name === 'select' && params.mode !== 'code') return 'towerMenu';
  if (name === 'match' && params.kind === 'tower') return 'towerBattle';
  return 'default';
}

export const getBg = () => current;

export async function setBg(key = 'default') {
  const app = document.getElementById('app'), my = ++token;
  if (!app || !FILES[key]) return;
  current = key; app.dataset.bg = key;   // 暗さの切り替え用
  let url = await load(key);
  if (!url && key !== 'default') url = await load('default');   // その画像がなければ、標準
  if (my !== token) return;                                      // 読み込み中に、次の切り替えがあったら、そちらを優先
  if (url) { app.style.setProperty('--bg-img', `url("${url}")`); app.classList.add('has-bg'); }
  else { app.classList.remove('has-bg'); app.style.removeProperty('--bg-img'); }
}
