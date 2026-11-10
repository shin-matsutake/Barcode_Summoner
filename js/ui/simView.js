// 対戦する：battleMenu＝形式を選ぶ（リンクバトル／シミュレーション）、simSetup＝シミュレーション（コンピュータ戦）の条件
import { h } from './dom.js';
import { toast } from './dialog.js';
import { portrait, elemIcon } from './portrait.js';
import { analyze } from '../core/jan.js';
import { parseTeam } from '../core/teamcode.js';
import { AI_LABELS } from './ai.js';
import { randomJan } from './summon.js';
import { formationPanel, summonPanel } from './ruleui.js';

const bar = (title, onBack) => { const b = h('header', 'bar'), back = h('button', 'btn small', '戻る'); back.onclick = onBack; b.append(back, h('h1', '', title)); return b; };

export function battleMenu(root, ctx) {
  const wrap = h('div', 'page');
  wrap.append(bar('対戦する', () => ctx.go('top')));
  const list = h('div', 'list');
  const item = (name, sub, target) => {
    const b = h('button', 'panel stage'), info = h('div', 'info');
    info.append(h('div', 'name', name), h('div', 'sub', sub));
    b.append(info);
    b.onclick = () => ctx.go(target);
    return b;
  };
  list.append(
    item('リンクバトル', 'ゲートでつないで、友だちと対戦する', 'pvpLobby'),
    item('シミュレーション', 'コンピュータと対戦する', 'simSetup'),
    item('クイックバトル', '1台のスマホで、2人で対戦する', 'hotSetup'));
  wrap.append(list); root.append(wrap);
}

function randomTeam(n) {
  const js = [];
  while (js.length < n) { const j = randomJan(); if (!js.includes(j)) js.push(j); }
  return js;
}

export function simSetup(root, ctx) {
  const S = ctx.session.sim || (ctx.session.sim = { rule: { bring: 3, fight: 3, summon: 'stock' }, ai: 2, foe: 'random', text: '', cfight: 0 });
  const wrap = h('div', 'page');
  wrap.append(bar('シミュレーション', () => ctx.go('battleMenu')));
  const body = h('div', 'list detail-body');
  wrap.append(body);
  const foot = h('div', 'detail-foot');
  const go = h('button', 'btn primary big-btn', '決定'); foot.append(go);
  wrap.append(foot); root.append(wrap);

  // 相手：ランダム／チームコード
  const foePanel = h('div', 'panel sel-sec'), foeSeg = h('div', 'seg'), foeBody = h('div', 'code-preview');
  foePanel.append(h('div', 'sec-l', '相手'));
  const ta = h('textarea', 'code-box'); ta.rows = 3; ta.placeholder = 'チームコードを貼り付け'; ta.value = S.text;
  ta.setAttribute('autocomplete', 'off'); ta.setAttribute('autocapitalize', 'off'); ta.spellcheck = false;
  const codeMsg = h('p', 'sub warn', '');
  const formWrap = h('div');   // 編成（ランダム）／戦う体数（チームコード）
  let parsed = null;

  const refreshCode = () => {
    S.text = ta.value; parsed = null;
    const raw = ta.value.trim();
    if (!raw) codeMsg.textContent = '';
    else { const r = parseTeam(raw); if (r.ok) { parsed = r.jans; codeMsg.textContent = ''; } else codeMsg.textContent = r.error; }
    if (parsed && (!S.cfight || S.cfight > Math.min(3, parsed.length))) S.cfight = Math.min(3, parsed.length);
    drawForm(); drawGo();
  };
  function drawForm() {
    formWrap.replaceChildren();
    if (S.foe === 'random') { formWrap.append(formationPanel(S.rule)); return; }
    const p = h('div', 'panel sel-sec'); p.append(h('div', 'sec-l', '戦う体数'));
    if (!parsed) { p.append(h('p', 'sub', 'チームコードを入れると、選べます。')); formWrap.append(p); return; }
    const names = h('p', 'sub', `相手のチーム（${parsed.length}体）：` + parsed.map(j => analyze(j, ctx.data).monster.name).join('、'));
    const seg = h('div', 'seg');
    for (let f = 1; f <= Math.min(3, parsed.length); f++) { const b = h('button', 'seg-b' + (S.cfight === f ? ' on' : ''), `${f}対${f}`); b.onclick = () => { S.cfight = f; drawForm(); }; seg.append(b); }
    p.append(names, seg); formWrap.append(p);
  }
  function drawGo() { go.disabled = S.foe === 'code' && !parsed; }
  function drawFoe() {
    foeSeg.replaceChildren(); foeBody.replaceChildren();
    [['random', 'ランダム'], ['code', 'チームコード']].forEach(([v, l]) => {
      const b = h('button', 'seg-b' + (S.foe === v ? ' on' : ''), l); b.onclick = () => { S.foe = v; drawFoe(); drawForm(); drawGo(); }; foeSeg.append(b);
    });
    if (S.foe === 'code') {
      const row = h('div', 'btn-row');
      const paste = h('button', 'btn small', '貼り付け'), clear = h('button', 'btn small', 'クリア');
      paste.onclick = async () => { try { ta.value = await navigator.clipboard.readText(); refreshCode(); } catch (e) { toast('貼り付けできませんでした。入力欄を長押しして、貼り付けてください'); ta.focus(); } };
      clear.onclick = () => { ta.value = ''; refreshCode(); };
      row.append(paste, clear); foeBody.append(ta, row, codeMsg);
    } else foeBody.append(h('p', 'sub', 'ランダムに作ったチームと戦います。'));
  }
  foePanel.append(foeSeg, foeBody);

  const aiPanel = h('div', 'panel sel-sec');
  aiPanel.append(h('div', 'sec-l', 'CPUの考え方'));
  const aiSeg = h('div', 'seg');
  AI_LABELS.forEach((l, i) => { const b = h('button', 'seg-b' + (S.ai === i + 1 ? ' on' : ''), l); b.onclick = () => { S.ai = i + 1; aiSeg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b)); }; aiSeg.append(b); });
  aiPanel.append(aiSeg);

  body.append(foePanel, formWrap, summonPanel(S.rule), aiPanel);
  ta.oninput = refreshCode;
  drawFoe(); refreshCode();

  go.onclick = () => {
    const jans = S.foe === 'random' ? randomTeam(S.rule.bring) : parsed;
    const fight = S.foe === 'random' ? S.rule.fight : S.cfight;
    if (!jans) return;
    ctx.go('select', { mode: 'code', jans, fight, ai: S.ai, summon: S.rule.summon });
  };
}
