// 小さなDOM部品（文字は textContent で入れるので、ニックネームなどを入れても安全）
export function h(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== '') e.textContent = text;
  return e;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
