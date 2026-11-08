// チームコード：先頭に体数（1〜5）、そのあとに13桁の番号を、体数ぶん並べる。例：2 4901234567894 4500000000018
// 体数が1桁、番号が13桁なので、長さは 1＋13×体数（最大66桁）。数字だけなので、コピー＆ペーストしやすい。
// 検証は、長さ・数字のみ・重複なし。13桁目の検算は、仕様書どおり、手入力のときだけ（コードでは見ない）。
export const TEAM_MAX = 5;

export function encodeTeam(jans) {
  if (!Array.isArray(jans) || jans.length < 1 || jans.length > TEAM_MAX) throw new Error('team size');
  return String(jans.length) + jans.join('');
}

// 戻り値：{ ok: true, jans } か { ok: false, error: 画面に出す文 }
export function parseTeam(text) {
  const t = String(text == null ? '' : text)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\s\-‐ー・,，.。]/g, '');   // 空白・改行・区切りの文字は無視する
  if (!t) return { ok: false, error: 'チームコードを貼り付けてください。' };
  if (!/^\d+$/.test(t)) return { ok: false, error: '数字以外の文字が入っています。コードをそのまま貼り付けてください。' };
  const n = Number(t[0]);
  if (n < 1 || n > TEAM_MAX) return { ok: false, error: `コードの形が正しくありません（先頭の数字は1〜${TEAM_MAX}）。` };
  const need = 1 + 13 * n;
  if (t.length !== need) return { ok: false, error: `長さが合いません。${n}体のコードは${need}桁です（いま${t.length}桁）。コードの一部が欠けているか、余分に入っているかもしれません。` };
  const jans = [];
  for (let i = 0; i < n; i++) {
    const j = t.slice(1 + 13 * i, 14 + 13 * i);
    if (jans.includes(j)) return { ok: false, error: `${i + 1}体目の番号が、ほかの体と重なっています。` };
    jans.push(j);
  }
  return { ok: true, jans };
}
