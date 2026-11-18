import { loadData } from './data.js?v=20261118-2';
import * as store from './storage.js?v=20261118-2';
import { screens } from './ui/screens.js?v=20261118-2';
import { closeAllDialogs } from './ui/dialog.js?v=20261118-2';
import { h } from './ui/dom.js?v=20261118-2';

import { initBackNav } from './ui/backnav.js?v=20261118-2';
import { bgFor, setBg } from './ui/bg.js?v=20261118-2';
import { ensureDexSeed } from './ui/summonFx.js?v=20261118-2';   // 古い保存データから、図鑑の記録を作る   // 背景の画像と、画面ごとの使い分けは、ui/bg.js
import { bgmFor, playBgm, playSe, setVolumeSource, clearLiveVolume } from './audio.js?v=20261118-2';

const root = document.getElementById('screen');
const ctx = { data: null, store, go, session: {} };
const audioBgm = bgmFor;   // 背景の bgFor と名前がぶつかるので
setVolumeSource(() => store.get().options);
document.addEventListener('click', e => {   // 何かを選んだときの音
  const b = e.target.closest && e.target.closest('button');
  if (b && !b.disabled && !b.classList.contains('sfx-skip')) setTimeout(() => playSe('se/select'), 0);   // ボタンの処理（消音の切り替えなど）が終わってから鳴らす
}, true);
let cleanup = null;

export function go(name, params = {}) {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  closeAllDialogs();
  root.replaceChildren();
  root.dataset.screen = name;
  const app = document.getElementById('app');   // 切り替えのスキャン線／画面ごとの背景の暗さ
  if (app) { app.dataset.screen = name; app.classList.remove('scan'); void app.offsetWidth; app.classList.add('scan'); }
  const fn = screens[name];
  if (!fn) { console.error('画面がありません:', name); return; }
  setBg(bgFor(name, params));
  clearLiveVolume();
  const bk = audioBgm(name, params); if (bk) playBgm(bk);   // 画面ごとのBGM（同じ曲なら、続けて鳴らす）
  cleanup = fn(root, ctx, params) || null;
}

async function boot() {
  store.load();
  try {
    ctx.data = await loadData();
    ensureDexSeed(ctx);
    go('soundGate');   // 音が出ることを知らせて、音を出すか消音かを選んでから、トップへ
    initBackNav(root, ctx);
  } catch (e) {
    console.error(e);
    const box = h('div', 'panel boot-error');
    box.append(h('h2', '', 'データを読み込めませんでした'));
    box.append(h('p', '', 'ファイルをダブルクリックで開いている場合は動きません。GitHub Pagesのアドレスから開いてください。'));
    box.append(h('p', 'sub', String(e.message || e)));
    const b = h('button', 'btn primary', 'もう一度読み込む');
    b.onclick = () => location.reload();
    box.append(b);
    root.replaceChildren(box);
  }
}
boot();
