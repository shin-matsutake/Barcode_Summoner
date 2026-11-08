// チームコード：teamCodeMake＝ストックから選んでコードを作る／teamCode＝友だちのコードに、CPUとして挑戦する
import { h } from './dom.js';
import { toast } from './dialog.js';
import { portrait, elemIcon } from './portrait.js';
import { analyze } from '../core/jan.js';
import { encodeTeam, parseTeam, TEAM_MAX } from '../core/teamcode.js';
import { AI_LABELS } from './ai.js';

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

// ---- コードに挑戦する ----
export function teamCode(root, ctx) {
  const S = ctx.session.teamCode || (ctx.session.teamCode = { text: '', fight: 0, ai: 2 });
  const wrap = h('div', 'page');
  root.append(wrap);
  wrap.append(backBar('チームコードで挑戦', () => ctx.go('tower')));
  const body = h('div', 'list detail-body');

  const inBox = h('div', 'panel sel-sec');
  inBox.append(h('div', 'sec-l', 'チームコード（友だちに教えてもらったもの）'));
  const ta = h('textarea', 'code-box'); ta.rows = 3; ta.placeholder = 'ここに貼り付け'; ta.value = S.text;
  ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocapitalize', 'off'); ta.spellcheck = false;
  const row = h('div', 'btn-row');
  const paste = h('button', 'btn small', '貼り付け');
  const clear = h('button', 'btn small', 'クリア');
  row.append(paste, clear);
  const msg = h('p', 'sub warn', '');
  inBox.append(ta, row, msg);

  const preview = h('div', 'code-preview');
  body.append(inBox, preview);
  wrap.append(body);
  const foot = h('div', 'detail-foot');
  const go = h('button', 'btn primary big-btn', '選出へ'); go.disabled = true;
  foot.append(go); wrap.append(foot);

  let parsed = null;
  const refresh = () => {
    S.text = ta.value;
    preview.replaceChildren(); parsed = null; go.disabled = true;
    const raw = ta.value.trim();
    if (!raw) { msg.textContent = ''; return; }
    const r = parseTeam(raw);
    if (!r.ok) { msg.textContent = r.error; return; }
    msg.textContent = ''; parsed = r.jans;
    const n = r.jans.length, maxFight = Math.min(3, n);
    if (!S.fight || S.fight > maxFight) S.fight = maxFight;

    const foe = h('div', 'panel sel-sec');
    foe.append(h('div', 'sec-l', `相手のチーム（${n}体。名前と属性だけ公開）`));
    const pool = h('div', 'pool'); pool.style.setProperty('--n', n);
    r.jans.forEach(j => { const p = analyze(j, ctx.data), c = h('div', 'pcard'); c.append(portrait(p.monster, { view: 'icon', cls: 'xs' }), h('div', 'pn', p.monster.name), elemIcon(p.monster.el, 'sm')); pool.append(c); });
    foe.append(pool);

    const rule = h('div', 'panel opt');
    rule.append(h('div', 'opt-head', `戦う体数（あなたは${n}体まで持ち込めます）`));
    const seg = h('div', 'seg');
    for (let f = 1; f <= maxFight; f++) { const b = h('button', 'seg-b' + (S.fight === f ? ' on' : ''), `${f}対${f}`); b.onclick = () => { S.fight = f; refresh(); }; seg.append(b); }
    rule.append(seg);
    const ai = h('div', 'panel opt');
    ai.append(h('div', 'opt-head', 'CPUの考え方'));
    const seg2 = h('div', 'seg');
    AI_LABELS.forEach((l, i) => { const b = h('button', 'seg-b' + (S.ai === i + 1 ? ' on' : ''), l); b.onclick = () => { S.ai = i + 1; refresh(); }; seg2.append(b); });
    ai.append(seg2);
    preview.append(foe, rule, ai);
    go.disabled = false;
  };
  ta.oninput = refresh;
  paste.onclick = async () => {
    try { ta.value = await navigator.clipboard.readText(); refresh(); }
    catch (e) { toast('貼り付けできませんでした。入力欄を長押しして、貼り付けてください'); ta.focus(); }
  };
  clear.onclick = () => { ta.value = ''; refresh(); };
  go.onclick = () => { if (parsed) ctx.go('select', { mode: 'code', jans: parsed, fight: S.fight, ai: S.ai }); };
  refresh();
}
