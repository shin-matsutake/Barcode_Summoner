// モンスターの絵を、枠にぴったり合わせて表示する。
// 画像ごとに、透明でない部分（絵が描かれている範囲）を測り、その範囲を枠いっぱいに広げる。
// 余白の大きさが画像ごとに違っても、同じくらいの大きさに見える。
// mode: 'contain'＝全身を枠に収める（anchor: 'bottom' 足元をそろえる／'center'）
//       'bust'＝枠の横幅に合わせて、上（顔）を見せる（アイコン用。下ははみ出して切れる）
const cache = new Map();

// 絵の範囲を、画像に対する割合（0〜1）で返す。測れないときは画像全体
export function artBox(img) {
  const key = img.currentSrc || img.src;
  if (cache.has(key)) return cache.get(key);
  let r = { x0: 0, y0: 0, x1: 1, y1: 1 };
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight, n = 128, sc = n / Math.max(nw, nh);
    const w = Math.max(1, Math.round(nw * sc)), hh = Math.max(1, Math.round(nh * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, hh);
    const d = g.getImageData(0, 0, w, hh).data;
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 >= x0 && y1 >= y0) r = { x0: x0 / w, y0: y0 / hh, x1: (x1 + 1) / w, y1: (y1 + 1) / hh };
  } catch (e) { /* file:// などで測れないときは、画像全体を使う */ }
  cache.set(key, r);
  return r;
}

const layouts = new WeakMap();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => {
  for (const e of entries) {
    if (!e.target.isConnected) { ro.unobserve(e.target); layouts.delete(e.target); continue; }
    const f = layouts.get(e.target); if (f) f();
  }
}) : null;

export function fitArt(box, img, { mode = 'contain', anchor = 'bottom', scale = 1, pad = 0.03 } = {}) {
  const layout = () => {
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H || !img.naturalWidth) return;
    const b = artBox(img), ratio = img.naturalWidth / img.naturalHeight;
    const aw = (b.x1 - b.x0) * ratio, ah = b.y1 - b.y0;   // 画像の高さを1としたときの、絵の幅・高さ
    let hi, top;
    if (mode === 'bust') {
      hi = W * (1 - 2 * pad) / aw;
      top = ah * hi <= H ? (H - ah * hi) / 2 - b.y0 * hi : H * pad - b.y0 * hi;
    } else {
      hi = Math.min(H * (1 - 2 * pad) / ah, W * (1 - 2 * pad) / aw) * scale;
      top = anchor === 'center' ? (H - ah * hi) / 2 - b.y0 * hi : H * (1 - pad) - b.y1 * hi;
    }
    const left = W / 2 - ((b.x0 + b.x1) / 2) * ratio * hi;
    img.style.cssText = `width:${(hi * ratio).toFixed(1)}px;height:${hi.toFixed(1)}px;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;right:auto;bottom:auto;object-fit:fill;max-width:none`;
  };
  layouts.set(box, layout);
  layout();
  if (ro) ro.observe(box);
}
