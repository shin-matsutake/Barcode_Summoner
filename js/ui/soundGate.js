// 最初の画面：音が出ることを知らせて、音を出すか消音にするかを選んでから、トップへ進む
// （タップしてから音を鳴らせるので、ブラウザの自動再生の制限にも合う）
import { h } from './dom.js?v=20261118-5';
import { setSound } from '../audio.js?v=20261118-5';

export function soundGate(root, ctx) {
  const wrap = h('div', 'gate');
  const box = h('div', 'panel gate-box');
  box.append(
    h('h2', '', '音が出ます'),
    h('p', '', 'このゲームには、BGM・効果音・ボイスがあります。'),
    h('p', 'sub', '電車や図書館など、まわりに配慮が必要な場所では、消音で始めてください。あとから、オプションでも切り替えられます。'),
  );
  const on = h('button', 'btn primary big-btn', '音を出して始める');
  const off = h('button', 'btn big-btn', '消音で始める');
  const start = v => { setSound(v); ctx.go('top'); };
  on.onclick = () => start(true); off.onclick = () => start(false);
  box.append(on, off);
  wrap.append(box);
  root.append(wrap);
  setTimeout(() => on.focus(), 0);
}
