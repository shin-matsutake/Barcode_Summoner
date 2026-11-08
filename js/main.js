import { loadData } from './data.js';
import * as store from './storage.js';
import { screens } from './ui/screens.js';
import { closeAllDialogs } from './ui/dialog.js';
import { h } from './ui/dom.js';
import { initBackNav } from './ui/backnav.js';

const root = document.getElementById('screen');
const ctx = { data: null, store, go, session: {} };
let cleanup = null;

export function go(name, params = {}) {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  closeAllDialogs();
  root.replaceChildren();
  root.dataset.screen = name;
  const fn = screens[name];
  if (!fn) { console.error('画面がありません:', name); return; }
  cleanup = fn(root, ctx, params) || null;
}

async function boot() {
  store.load();
  try {
    ctx.data = await loadData();
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
