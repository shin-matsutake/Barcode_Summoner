// チームコードを作る（ストックから選ぶ）。コードに挑戦するのは、シミュレーション（simView.js）
import { h } from './dom.js';
import { toast } from './dialog.js';
import { portrait, elemIcon } from './portrait.js';
import { analyze } from '../core/jan.js';
import { encodeTeam, TEAM_MAX } from '../core/teamcode.js';

function backBar(title, onBack) {
  const bar = h('header', 'bar'), b = h('button', 'btn small', '戻る');
  b.onclick = onBack; bar.append(b, h('h1', '', title)); return bar;
}

async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 下の方法で */ }
  try { el.focus(); el.select(); el.setSelectionRange(0, 99999); return document.execCommand('copy'); } catch (e) { return false; }
}

// ---- コードを作る（ストックから1〜5体） ----
export function teamCodeMake(root, ctx) {
  const wrap = h('div', 'page');
  root.append(wrap);
  const picked = [];   // 選んだ順（＝CPUが出てくる順）
  const items = ctx.store.get().stock;
  const draw = () => {
    wrap.replaceChildren(backBar('チームコードを作る', () => ctx.go('stock')));
    const body = h('div', 'list detail-body');
    body.append(h('p', 'sub', `ストックから1〜${TEAM_MAX}体を選びます。選んだ順に、相手のCPUが出てきます。できたコードを、友だちに送ってください。`));
    if (!items.length) body.append(h('div', 'panel empty', 'ストックに仲間がいません'));
    for (const it of items) {
      let p; try { p = analyze(it.jan, ctx.data); } catch (e) { continue; }
      const n = picked.indexOf(it.jan);
      const row = h('button', 'panel row row-btn' + (n >= 0 ? ' picked' : ''));
      const info = h('div', 'info');
      info.append(h('div', 'name', it.nick ? `${it.nick}（${p.monster.name}）` : p.monster.name), h('div', 'sub', `HP ${p.stats.hp}`));
      row.append(portrait(p.monster, { view: 'icon', cls: 'sm' }), info, elemIcon(p.monster.el));
      if (n >= 0) row.append(h('span', 'ord', String(n + 1)));
      row.onclick = () => {
        if (n >= 0) picked.splice(n, 1);
        else if (picked.length >= TEAM_MAX) { toast(`チームは${TEAM_MAX}体までです`); return; }
        else picked.push(it.jan);
        draw();
      };
      body.append(row);
    }
    wrap.append(body);

    const foot = h('div', 'detail-foot');
    const box = h('textarea', 'code-box'); box.readOnly = true; box.rows = 3;
    box.placeholder = '体を選ぶと、ここにコードが出ます';
    box.value = picked.length ? encodeTeam(picked) : '';
    box.onfocus = () => box.select();
    const copy = h('button', 'btn primary big-btn', picked.length ? `コードをコピー（${picked.length}体）` : '体を選んでください');
    copy.disabled = !picked.length;
    copy.onclick = async () => toast((await copyText(box.value, box)) ? 'コピーしました' : 'コピーできませんでした。コードを長押ししてコピーしてください');
    foot.append(box, copy);
    wrap.append(foot);
  };
  draw();
}
