import { loadData } from './data.js';
import * as store from './storage.js';
import { screens } from './ui/screens.js';
import { closeAllDialogs } from './ui/dialog.js';
import { h } from './ui/dom.js';

// 背景の画像（images の中）。あれば使う。名前は、ここで変える
const BG_FILE = 'images/BARK.jpg';
import { initBackNav } from './ui/backnav.js';

const root = document.getElementById('screen');
const ctx = { data: null, store, go, session: {} };
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
  cleanup = fn(root, ctx, params) || null;
}

async function boot() {
  store.load();
  try {
    ctx.data = await loadData();
    // 画像の場所は、CSSの場所ではなく、ページの場所を基準にして渡す
    const bg = new Image(); bg.onload = () => { const a = document.getElementById('app'); a.style.setProperty('--bg-img', `url("${new URL(BG_FILE, location.href).href}")`); a.classList.add('has-bg'); }; bg.src = BG_FILE;
    go('top');
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
