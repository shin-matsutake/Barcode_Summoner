// カメラでバーコード（JAN／EAN-13）を読み取る。
// 読み取りの順番：
//   ① ブラウザ標準の BarcodeDetector（AndroidのChromeなど。速くて軽い）
//   ② ZXing（CDNから読み込む。iPhoneのSafariなど、標準の機能がない端末）
// どちらも使えない／カメラの許可が出ない／カメラがない、ときは、
//   ③ 写真を撮って読み取る（カメラアプリを使うので、ほとんどの端末で動く）
//   ④ 番号を手で入れる
import { h } from './dom.js';
import { isValidCheckDigit } from '../core/jan.js';

const ZXING_URLS = [
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
  'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js',
];

// 読み取った文字を、使える13桁にそろえる。使えなければ null
// （アメリカの商品のUPC-A＝12桁は、先頭に0を足すとEAN-13になる）
export function normalizeScanned(text) {
  const t = String(text == null ? '' : text).trim();
  if (/^\d{13}$/.test(t) && isValidCheckDigit(t)) return t;
  if (/^\d{12}$/.test(t) && isValidCheckDigit('0' + t)) return '0' + t;
  return null;
}

// ---- 読み取りエンジン ----
function loadScript(url) {
  return new Promise((ok, ng) => {
    const s = document.createElement('script');
    s.src = url; s.async = true;
    s.onload = ok; s.onerror = () => { s.remove(); ng(new Error('load')); };
    document.head.append(s);
  });
}
let zxingPromise = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!zxingPromise) {
    zxingPromise = (async () => {
      for (const u of ZXING_URLS) {
        try { await loadScript(u); if (window.ZXing) return window.ZXing; } catch (e) { /* 次の配布元へ */ }
      }
      throw new Error('zxing');
    })().catch(e => { zxingPromise = null; throw e; });
  }
  return zxingPromise;
}

// decode(video か画像) → 読み取った文字の配列（なければ空）
let decoderPromise = null;
export function getDecoder() {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      if (typeof BarcodeDetector !== 'undefined') {
        try {
          const sup = await BarcodeDetector.getSupportedFormats();
          const formats = ['ean_13', 'upc_a'].filter(f => sup.includes(f));
          if (formats.includes('ean_13')) {
            const det = new BarcodeDetector({ formats });
            return { kind: 'native', decode: async src => (await det.detect(src)).map(r => r.rawValue) };
          }
        } catch (e) { /* ZXingに切り替える */ }
      }
      const ZX = await loadZXing();
      const hints = new Map();
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.UPC_A]);
      hints.set(ZX.DecodeHintType.TRY_HARDER, true);
      const reader = new ZX.MultiFormatReader();
      const canvas = document.createElement('canvas');
      const g = canvas.getContext('2d', { willReadFrequently: true });
      return {
        kind: 'zxing',
        decode: async src => {
          const w = src.videoWidth || src.width, hh = src.videoHeight || src.height;
          if (!w || !hh) return [];
          const sc = Math.min(1, (src.videoWidth ? 960 : 1600) / w);   // 動画は軽く、写真は細かく
          canvas.width = Math.round(w * sc); canvas.height = Math.round(hh * sc);
          g.drawImage(src, 0, 0, canvas.width, canvas.height);
          try {
            const bmp = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.HTMLCanvasElementLuminanceSource(canvas)));
            return [reader.decode(bmp, hints).getText()];
          } catch (e) { return []; }
        },
      };
    })().catch(e => { decoderPromise = null; throw e; });
  }
  return decoderPromise;
}

async function toBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 古い端末 */ }
  try { return await createImageBitmap(file); } catch (e) { /* 下へ */ }
  return await new Promise((ok, ng) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => ok(img); img.onerror = () => ng(new Error('img')); img.src = url;
  });
}

const firstJan = texts => texts.map(normalizeScanned).find(Boolean) || null;

// ---- 画面の部品 ----
// プライバシーのため、カメラは「タップしたとき」だけ起動する。次のときは、自動で止まって、またタップが必要になる：
//   読み取れたとき／30秒たったとき／アプリを裏に回したとき／画面を離れたとき
// onJan(jan)：読み取れた13桁。onManual()：「番号を入力する」。stop() で止める（画面を離れるとき）
export const AUTO_STOP_MS = 30000;
// カメラの下に、いつも出すお願い（文面は、ここで変える）
export const SCAN_NOTICE = 'お願い：お店の商品のバーコードを、買わずに読み取るのは、やめましょう。まわりの人の迷惑にならないよう、気をつけてください。';
export function cameraPanel({ onJan, onManual }) {
  const el = h('div', 'cam-panel');
  const view = h('div', 'cam-view');
  const video = h('video', 'cam-video');
  video.muted = true; video.playsInline = true; video.autoplay = true;
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  const guide = h('div', 'cam-guide'); guide.append(h('i'));
  const msg = h('div', 'cam-msg');
  const startBtn = h('button', 'cam-start');
  startBtn.append(h('b', '', 'タップして、カメラを起動'), h('span', '', '読み取れたとき・30秒たったときは、自動で止まります'));
  view.append(video, guide, msg, startBtn);
  view.classList.add('idle');
  const status = h('p', 'cam-status', 'カメラは、タップしたときだけ起動します');
  status.setAttribute('role', 'status');

  const row = h('div', 'cam-btns');
  const retry = h('button', 'btn small retry', 'もう一度試す'); retry.hidden = true;
  const photo = h('button', 'btn small', '写真で読み取る');
  const manual = h('button', 'btn small', '番号を入力する');
  const file = h('input'); file.type = 'file'; file.accept = 'image/*'; file.setAttribute('capture', 'environment'); file.hidden = true;
  row.append(retry, photo, manual);
  el.append(view, status, row, h('p', 'cam-note', SCAN_NOTICE), file);

  let stream = null, timer = null, autoTimer = null, stopped = true, busy = false, last = null, count = 0;
  const say = t => { status.textContent = t; };
  const onHide = () => { if (document.hidden) toIdle('アプリが裏に回ったので、カメラを止めました。'); };
  const release = () => {
    clearInterval(timer); timer = null; clearTimeout(autoTimer); autoTimer = null;
    document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
  };
  const stop = () => { stopped = true; release(); };
  // カメラを止めて、「タップして起動」の状態に戻す
  function toIdle(text) {
    stop(); view.classList.remove('err', 'ok'); view.classList.add('idle'); msg.textContent = ''; retry.hidden = true; say(text);
  }
  const fail = text => { release(); view.classList.add('err'); msg.textContent = text; say(''); retry.hidden = false; };
  const done = jan => {
    stop();
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* 何もしない */ }
    say('読み取れました'); view.classList.add('ok');
    onJan(jan);
  };

  async function start() {
    stopped = false; last = null; count = 0; retry.hidden = true;
    view.classList.remove('err', 'ok', 'idle'); msg.textContent = ''; say('カメラを起動しています…');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return fail('この環境ではカメラが使えません。「写真で読み取る」か、番号を入力してください。');
    }
    const decoderReady = getDecoder().then(d => d, e => e);   // 起動と同時に、読み取りの部品を用意する
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
    } catch (e) {
      if (stopped) return;
      return fail(e && e.name === 'NotAllowedError'
        ? 'カメラの使用が許可されていません。設定で許可するか、「写真で読み取る」・番号の入力を使ってください。'
        : e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')
          ? 'カメラが見つかりません。「写真で読み取る」か、番号を入力してください。'
          : 'カメラを起動できませんでした。「写真で読み取る」か、番号を入力してください。');
    }
    if (stopped) { release(); return; }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* 自動再生が止められても、映像は出る */ }
    const decoder = await decoderReady;
    if (stopped) return;
    if (decoder instanceof Error) return fail('読み取りの部品を読み込めませんでした。通信を確認するか、「写真で読み取る」・番号の入力を使ってください。');
    say('13桁のバーコードを、わくの中に入れてください');
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onHide);
    autoTimer = setTimeout(() => toIdle('30秒たったので、カメラを止めました。もう一度、タップして起動してください。'), AUTO_STOP_MS);
    timer = setInterval(async () => {
      if (busy || stopped || video.readyState < 2) return;
      busy = true;
      try {
        const texts = await decoder.decode(video);
        if (stopped) return;
        if (!texts.length) { last = null; count = 0; return; }
        const jan = firstJan(texts);
        if (!jan) { say('このバーコードは使えません（13桁のJANコードをかざしてください）'); last = null; count = 0; return; }
        count = jan === last ? count + 1 : 1; last = jan;
        if (count >= 2) done(jan);   // 2回続けて同じ番号が読めたら確定
      } catch (e) { /* 次の周期でまた読む */ } finally { busy = false; }
    }, 140);
  }

  retry.onclick = start; startBtn.onclick = start;
  manual.onclick = () => { stop(); onManual(); };
  photo.onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files && file.files[0]; file.value = '';
    if (!f) return;
    say('写真を読み取っています…');
    try {
      const decoder = await getDecoder(), bmp = await toBitmap(f);
      const jan = firstJan(await decoder.decode(bmp));
      if (bmp.close) bmp.close();
      if (jan) done(jan); else say('読み取れませんでした。バーコードを大きく、ピントを合わせて、もう一度撮ってください。');
    } catch (e) {
      say('読み取りの部品を読み込めませんでした。通信を確認するか、番号を入力してください。');
    }
  };
  return { el, start, stop };
}
