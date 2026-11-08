// 端末の「戻る」ボタン（Androidの戻る・ブラウザの戻る・iPhoneの端からのスワイプ）への対応。
// ブラウザは、アプリが自分で閉じることができない。そこで、履歴に「入口」を1つ作っておき、
// 戻るが押されたら、入口を作り直して、画面ごとの動きをする：
//   ダイアログが開いている … 先頭のボタン（やめる・続ける・OK）を押す
//   トップ画面 … 「ゲームを終了しますか？」の確認。終了を選ぶと、アプリの外へ戻る
//   バトル中 … メニュー（一時停止・ギブアップの確認）を開く
//   召喚の演出 … 演出を飛ばす
//   そのほか … 画面の「戻る」ボタンを押す（なければトップへ）
// ブラウザの決まりで、最初の操作（タップ）より前には、入口を作れない（作ると、戻るで飛ばされる）。
import { confirmDialog, toast } from './dialog.js';

export function initBackNav(root, ctx) {
  let armed = false, leaving = false, asking = false;
  const push = () => { try { history.pushState({ barcodeSummonerGuard: true }, '', location.href); } catch (e) { /* 何もしない */ } };
  const arm = () => { if (armed) return; armed = true; push(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, arm, { once: true, capture: true, passive: true }));

  async function askExit() {
    if (asking) return;
    asking = true;
    const ok = await confirmDialog('ゲームを終了しますか？', '終了する', 'つづける');
    asking = false;
    if (!ok) return;
    // 入口の1つ手前（最初のページ）まで戻り、もう1回戻る＝アプリの外へ。
    leaving = true;
    history.go(-1);
    setTimeout(() => history.back(), 80);
    setTimeout(() => {   // 外へ戻れなかったとき（戻る先がないとき）
      if (document.hidden) return;
      leaving = false; push();
      toast('ブラウザ（アプリ）を、ホームボタンなどで閉じてください');
    }, 900);
  }

  function handle() {
    const dlg = document.querySelector('#dialog .dlg');
    if (dlg) { const b = dlg.querySelector('[data-back]'); if (b) b.click(); return; }   // ボタンのない自動のダイアログは、何もしない
    const name = root.dataset.screen;
    if (!name || name === 'top') return askExit();
    if (name === 'match') { const m = root.querySelector('.bt-top .btn'); if (m) m.click(); return; }
    if (name === 'summonFx') { const f = root.querySelector('.sfx'); if (f) f.click(); return; }
    const back = root.querySelector('.bar .btn');
    if (back) back.click(); else ctx.go('top');
  }

  window.addEventListener('popstate', () => {
    if (leaving || !armed) return;
    push();       // 入口を作り直す（戻るを押すたびに、1つ消えるため）
    handle();
  });
}
