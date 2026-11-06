import { h } from './dom.js';
const layer = () => document.getElementById('dialog');

// メッセージのダイアログ。押されたボタンの value を返す（自動で閉じたときは null）
export function dialog({ title = '', text = '', buttons = [{ label: 'OK', value: true }], auto = 0 }) {
  return new Promise(resolve => {
    const back = h('div', 'dlg-back');
    const box = h('div', 'dlg panel');
    box.setAttribute('role', 'dialog');
    if (title) box.append(h('h2', 'dlg-title', title));
    if (text) box.append(h('p', 'dlg-text', text));
    let done = false, timer = 0;
    const close = v => { if (done) return; done = true; clearTimeout(timer); back.remove(); resolve(v); };
    if (buttons.length) {
      const row = h('div', 'dlg-btns');
      buttons.forEach((b, i) => {
        const btn = h('button', 'btn' + (b.primary || (buttons.length === 1) ? ' primary' : ''), b.label);
        btn.onclick = () => close(b.value);
        row.append(btn);
        if (i === 0) setTimeout(() => btn.focus(), 0);
      });
      box.append(row);
    }
    back.append(box);
    layer().append(back);
    if (auto) timer = setTimeout(() => close(null), auto);
  });
}
export const confirmDialog = (text, yes = 'はい', no = 'キャンセル') =>
  dialog({ text, buttons: [{ label: no, value: false }, { label: yes, value: true, primary: true }] });
export function closeAllDialogs() { layer().replaceChildren(); }

let toastTimer = 0;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ストーリーの文を1ページずつ出す（pages は文字列または文字列の配列）。タップ（ボタン）で次へ
export async function story(pages, title = '') {
  const list = (Array.isArray(pages) ? pages : [pages]).map(String).filter(t => t.trim());
  for (let i = 0; i < list.length; i++) {
    await dialog({ title, text: list[i], buttons: [{ label: i < list.length - 1 ? '次へ' : 'OK', value: true }] });
  }
}
