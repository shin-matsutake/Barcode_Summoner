// 小さなDOM部品（文字は textContent で入れるので、ニックネームなどを入れても安全）
export function h(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== '') e.textContent = text;
  return e;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
