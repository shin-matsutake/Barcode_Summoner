// モンスターを1体選ぶ画面（ストックから／番号を入れる／ランダム）
import { h } from './dom.js';
import { portrait, elemIcon } from './portrait.js';
import { analyze, isValidCheckDigit } from '../core/jan.js';
import { randomJan } from './summon.js';

// 戻り値：{ jan } または null（やめた）
export function pickMonster(ctx, { exclude = [], tabs = ['stock', 'number'], title = '仲間を選ぶ' } = {}) {
  return new Promise(resolve => {
    const back = h('div', 'dlg-back');
    const box = h('div', 'dlg panel pick');
    const close = v => { back.remove(); resolve(v); };
    box.append(h('h2', 'dlg-title', title));
    const names = { stock: 'ストック', roster: 'タワーの仲間', number: '番号を入れる', random: 'ランダム' };
    const seg = h('div', 'seg'); const body = h('div', 'pick-body');
    const show = t => {
      seg.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      body.replaceChildren();
      if (t === 'stock' || t === 'roster') {
        const st = ctx.store.get();
        const all = t === 'roster' ? st.tower.roster.map(j => ({ jan: j, nick: (st.stock.find(x => x.jan === j) || {}).nick || '' })) : st.stock;
        const items = all.filter(it => !exclude.includes(it.jan));
        if (!items.length) body.append(h('p', 'sub', tabs.includes('number') ? '選べる仲間がいません。「番号を入れる」から召喚できます。' : '選べる仲間がいません。'));
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
      } else if (t === 'number') {
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
        body.append(input, msg, ok);
        setTimeout(() => input.focus(), 30);
      } else {
        const b = h('button', 'btn primary big-btn', 'ランダムで決める');
        b.onclick = () => { let j; do { j = randomJan(); } while (exclude.includes(j)); close({ jan: j }); };
        body.append(h('p', 'sub', '番号を、ランダムに作って決めます。'), b);
      }
    };
    for (const t of tabs) { const b = h('button', 'seg-b', names[t]); b.dataset.t = t; b.onclick = () => show(t); seg.append(b); }
    const cancel = h('button', 'btn small', 'やめる'); cancel.onclick = () => close(null);
    box.append(seg, body, cancel);
    back.append(box);
    document.getElementById('dialog').append(back);
    show(tabs[0]);
  });
}
