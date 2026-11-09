// モンスターを1体選ぶ画面（ストックから／召喚＝カメラか番号／ランダム）
import { h } from './dom.js';
import { portrait, elemIcon } from './portrait.js';
import { analyze, isValidCheckDigit } from '../core/jan.js';
import { randomJan } from './summon.js';
import { cameraPanel } from './scanner.js';
import { toast } from './dialog.js';

// 戻り値：{ jan } または null（やめた）
export function pickMonster(ctx, { exclude = [], tabs = ['stock', 'summon'], title = '仲間を選ぶ' } = {}) {
  return new Promise(resolve => {
    const back = h('div', 'dlg-back');
    const box = h('div', 'dlg panel pick');
    let cam = null;
    const stopCam = () => { if (cam) { cam.stop(); cam = null; } };
    const close = v => { stopCam(); back.remove(); resolve(v); };
    box.append(h('h2', 'dlg-title', title));
    const names = { stock: 'ストック', roster: 'タワーの仲間', summon: '召喚', random: 'ランダム' };
    const seg = h('div', 'seg'); const body = h('div', 'pick-body');
    const show = t => {
      stopCam();
      seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      body.replaceChildren();
      if (t === 'stock' || t === 'roster') {
        const st = ctx.store.get();
        const all = t === 'roster' ? st.tower.roster.map(j => ({ jan: j, nick: (st.stock.find(x => x.jan === j) || {}).nick || '' })) : st.stock;
        const items = all.filter(it => !exclude.includes(it.jan));
        if (!items.length) body.append(h('p', 'sub', tabs.includes('summon') ? '選べる仲間がいません。「召喚」から読み込めます。' : '選べる仲間がいません。'));
        for (const it of items) {
          let p; try { p = analyze(it.jan, ctx.data); } catch (e) { continue; }
          const row = h('button', 'pick-row');
          row.append(portrait(p.monster, { view: 'icon', cls: 'xs' }));
          const info = h('div', 'info');
          info.append(h('div', 'name', it.nick ? `${it.nick}（${p.monster.name}）` : p.monster.name), h('div', 'sub', `HP ${p.stats.hp}`));
          row.append(info, elemIcon(p.monster.el));
          row.onclick = () => close({ jan: it.jan });
          body.append(row);
        }
      } else if (t === 'summon') {   // 召喚：カメラが主役。「番号を入力する」で手入力へ（召喚画面と同じ）
        const pickJan = j => {
          if (exclude.includes(j)) { toast('この番号は、すでに入っています'); return false; }
          close({ jan: j }); return true;
        };
        const renderSum = mode => {
          stopCam(); body.replaceChildren();
          if (mode === 'camera') {
            cam = cameraPanel({ onJan: j => { if (!pickJan(j)) renderSum('camera'); }, onManual: () => renderSum('number') });
            body.append(cam.el);
            return;
          }
          const input = h('input', 'jan-input'); input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 13; input.placeholder = '13桁の番号';
          const msg = h('p', 'sub warn', '');
          const ok = h('button', 'btn primary', '決定'); ok.disabled = true;
          input.oninput = () => { input.value = input.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 13); ok.disabled = input.value.length !== 13; msg.textContent = ''; };
          ok.onclick = () => {
            const j = input.value;
            if (!isValidCheckDigit(j)) { msg.textContent = '13桁目の確認用の数字が合いません。打ち間違いを確認してください。'; return; }
            if (exclude.includes(j)) { msg.textContent = 'この番号は、すでに入っています。'; return; }
            close({ jan: j });
          };
          input.onkeydown = e => { if (e.key === 'Enter') ok.click(); };
          const camBtn = h('button', 'btn small', 'カメラで読み取る'); camBtn.onclick = () => renderSum('camera');
          body.append(input, msg, ok, camBtn);
          setTimeout(() => input.focus(), 30);
        };
        renderSum('camera');
      } else {
        const b = h('button', 'btn primary big-btn', 'ランダムで決める');
        b.onclick = () => { let j; do { j = randomJan(); } while (exclude.includes(j)); close({ jan: j }); };
        body.append(h('p', 'sub', '番号を、ランダムに作って決めます。'), b);
      }
    };
    for (const t of tabs) { const b = h('button', 'seg-b', names[t]); b.dataset.t = t; b.onclick = () => show(t); seg.append(b); }
    const cancel = h('button', 'btn small', 'やめる'); cancel.onclick = () => close(null); cancel.dataset.back = '1';
    box.append(seg, body, cancel);
    back.append(box);
    document.getElementById('dialog').append(back);
    show(tabs[0]);
  });
}
