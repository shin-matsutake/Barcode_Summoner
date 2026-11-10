import { h } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait } from './portrait.js';
import { analyze } from '../core/jan.js';
import { match } from './matchView.js';
import { select } from './select.js';
import { tower, auto } from './modes.js';
import { hotSetup, hotPlay } from './hotView.js';
import { story } from './storyView.js';
import { summon, detail } from './summon.js';
import { summonFx } from './summonFx.js';
import { towerRoster, towerAdd, inRoster } from './roster.js';
import { teamCodeMake } from './teamcodeView.js';
import { battleMenu, simSetup } from './simView.js';
import { pvpLobby, pvpSelect } from './pvpView.js';

const TITLE = 'バーコード・サモナー';

// ロゴの下のバーコード風の帯。幅の並びは固定（毎回同じ）
function barcodeStrip() {
  const w = [2,1,3,1,1,2,3,1,2,2,1,3,1,2,1,1,3,2,1,2,2,1,1,3,1,2,3,1,1,2,1,3,2,1,2,1,1,3,2,1];
  const strip = h('div', 'bars');
  w.forEach((n, i) => {
    const b = h('i');
    b.style.width = n * 2 + 'px';
    b.style.marginRight = (i % 3 === 0 ? 4 : 2) + 'px';
    strip.append(b);
  });
  strip.append(h('u', 'scan'));
  return strip;
}

function backBar(ctx, title) {
  const bar = h('header', 'bar');
  const b = h('button', 'btn small', '戻る');
  b.onclick = () => ctx.go('top');
  bar.append(b, h('h1', '', title));
  return bar;
}

function top(root, ctx) {
  const wrap = h('div', 'top');
  const logo = h('div', 'logo');
  // ロゴ画像（images/LOGO.png）。ファイルがなければ、文字のタイトルとバーコードの帯を出す
  const img = h('img', 'logo-img');
  img.alt = TITLE; img.width = 793; img.height = 253; img.src = 'images/LOGO.png';
  img.onerror = () => img.replaceWith(h('h1', '', TITLE), barcodeStrip());
  logo.append(img);
  wrap.append(logo);
  const menu = h('nav', 'menu');
  const items = [
    ['召喚する', 'summon', 'バーコードを読み取って、仲間を呼ぶ'],
    ['対戦する', 'battleMenu', 'リンクバトル・シミュレーション'],
    ['CPUタワー', 'tower', `${ctx.data.tower.stages.length}つのステージに挑戦`],
    ['オートバトル', 'auto', 'CPUどうしの対戦を観戦'],
    ['ストック', 'stock', '召喚した仲間を見る'],
    ['チュートリアル', 'tutorial', '遊び方を学ぶ'],
    ['オプション', 'options', '音量・演出・データ'],
  ];
  for (const [label, target, sub] of items) {
    const b = h('button', 'btn menu-btn' + (target ? '' : ' soon'));
    b.append(h('span', 'ml', label), h('span', 'ms', target ? sub : '準備中'));
    b.onclick = () => target ? ctx.go(target) : toast(`「${label}」はこれから追加します`);
    menu.append(b);
  }
  wrap.append(menu);
  wrap.append(h('p', 'ver', `データ v${ctx.data.version}`));
  root.append(wrap);
}

function stock(root, ctx) {
  const wrap = h('div', 'page');
  wrap.append(backBar(ctx, 'ストック'));
  const list = h('div', 'list');
  const items = ctx.store.get().stock;
  if (items.length) {
    const mk = h('button', 'btn small', 'チームコードを作る');
    mk.onclick = () => ctx.go('teamCodeMake'); list.append(mk);
  }
  if (!items.length) {
    const e = h('div', 'panel empty');
    e.append(h('p', 'big', 'まだ誰も召喚していません'), h('p', 'sub', 'トップの「召喚する」から番号を入れると、ここに仲間が並びます。'));
    list.append(e);
  }
  for (const it of items) {
    let p; try { p = analyze(it.jan, ctx.data); } catch (e) { continue; }
    const row = h('button', 'panel row row-btn');
    row.onclick = () => ctx.go('detail', { jan: it.jan });
    row.append(portrait(p.monster, { view: 'icon', cls: 'sm' }));
    const info = h('div', 'info');
    info.append(h('div', 'name', it.nick ? `${it.nick}（${p.monster.name}）` : p.monster.name), h('div', 'sub', `HP ${p.stats.hp}　召喚日 ${it.date || '-'}`));
    if (inRoster(ctx, it.jan)) info.append(h('span', 'tower-tag', 'タワーの仲間'));
    row.append(info);
    list.append(row);
  }
  wrap.append(list);
  root.append(wrap);
}

function options(root, ctx) {
  // 設定は、いったん下書き（d）に入れて、「決定」を押したときに、まとめて反映する
  const saved = ctx.store.get().options, d = { ...saved };
  const isDirty = () => Object.keys(d).some(k => d[k] !== saved[k]);
  const wrap = h('div', 'page');
  const bar = backBar(ctx, 'オプション');
  bar.querySelector('.btn').onclick = async () => {
    if (isDirty() && !(await confirmDialog('変更をまだ反映していません。\n破棄して戻りますか？', '破棄して戻る', '設定に戻る'))) return;
    ctx.go('top');
  };
  wrap.append(bar);
  const body = h('div', 'list detail-body');
  const foot = h('div', 'detail-foot');
  const apply = h('button', 'btn primary big-btn', '決定');
  const refresh = () => { const dirty = isDirty(); apply.disabled = !dirty; apply.textContent = dirty ? '決定（変更を反映）' : '変更はありません'; };
  apply.onclick = () => { ctx.store.update(s => { Object.assign(s.options, d); }); Object.assign(saved, d); toast('設定を反映しました'); refresh(); };

  const slider = (label, key, note) => {
    const row = h('div', 'panel opt');
    const head = h('div', 'opt-head');
    const val = h('b', '', String(d[key]));
    head.append(h('span', '', label), val);
    const r = h('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = d[key];
    r.oninput = () => { d[key] = +r.value; val.textContent = r.value; refresh(); };
    row.append(head, r);
    if (note) row.append(h('p', 'sub', note));
    return row;
  };
  const toggle = (label, key, note) => {
    const row = h('label', 'panel opt opt-toggle');
    const t = h('div'); t.append(h('span', '', label)); if (note) t.append(h('p', 'sub', note));
    const c = h('input'); c.type = 'checkbox'; c.checked = !!d[key];
    c.onchange = () => { d[key] = c.checked; refresh(); };
    row.append(t, c, h('i', 'sw'));
    return row;
  };
  body.append(slider('BGM音量', 'bgm'), slider('効果音の音量', 'se', '音の素材をフォルダに入れると鳴るようになります'));

  const tempo = h('div', 'panel opt');
  tempo.append(h('div', 'opt-head', ''));
  tempo.firstChild.append(h('span', '', 'バトルのテンポ'));
  const seg = h('div', 'seg tempo5');
  [['slowest', 'ゆっくり'], ['slow', 'じっくり'], ['normal', 'ふつう'], ['quick', 'はやい'], ['fast', '高速']].forEach(([v, l]) => {
    const b = h('button', 'seg-b' + (d.tempo === v ? ' on' : ''), l);
    b.onclick = () => { d.tempo = v; seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b)); refresh(); };
    seg.append(b);
  });
  tempo.append(seg);
  body.append(tempo,
    toggle('バトル演出', 'fx', 'ダメージを受けたときの揺れ'),
    toggle('相手のニックネームを表示', 'showFoeNick', 'オフにすると、相手のモンスターは本来の名前だけ表示します'));

  const dataBox = h('div', 'panel opt');
  dataBox.append(h('div', 'opt-head', ''));
  dataBox.firstChild.append(h('span', '', 'データ（押すと、すぐに実行されます）'));
  const row = h('div', 'btn-row');
  const ex = h('button', 'btn small', '書き出す');
  ex.onclick = () => {
    const a = h('a'); a.href = URL.createObjectURL(new Blob([ctx.store.exportText()], { type: 'application/json' }));
    a.download = 'barcode-summoner-save.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const file = h('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
  file.onchange = async () => {
    try { ctx.store.importText(await file.files[0].text()); toast('読み込みました'); ctx.go('options'); }
    catch (e) { dialog({ title: '読み込めません', text: e.message }); }
  };
  const im = h('button', 'btn small', '読み込む'); im.onclick = () => file.click();
  const rs = h('button', 'btn small danger', '初期化');
  rs.onclick = async () => {
    if (await confirmDialog('ストックと設定をすべて消します。元に戻せません。よろしいですか？', '消す')) { ctx.store.reset(); toast('初期化しました'); ctx.go('options'); }
  };
  row.append(ex, im, rs, file);
  dataBox.append(row);
  if (ctx.store.isVolatile()) dataBox.append(h('p', 'sub warn', 'このブラウザでは保存できないため、閉じると消えます。'));
  body.append(dataBox, h('p', 'ver', `データ v${ctx.data.version}`));
  wrap.append(body);
  foot.append(apply); wrap.append(foot);
  refresh();
  root.append(wrap);
}

// チュートリアル：幕の一覧。台本（data/story.json）にある幕は、遊べる。全4幕の想定で、まだ無い幕は「準備中」
function tutorial(root, ctx) {
  const wrap = h('div', 'page');
  wrap.append(backBar(ctx, 'チュートリアル'));
  const list = h('div', 'list'), acts = ctx.data.story.acts, done = ctx.store.get().tutorial.done;
  list.append(h('p', 'sub', '遊び方を、物語といっしょに学べます。'));
  const TOTAL = 4, names = ['第一幕', '第二幕', '第三幕', '第四幕'];
  for (let n = 0; n < TOTAL; n++) {
    const a = acts[n], seen = a && done.includes(a.id);
    const b = h('button', 'panel stage' + (a ? '' : ' locked') + (seen ? ' done' : '')), info = h('div', 'info');
    info.append(h('div', 'name', a ? (a.title || names[n]) : names[n]), h('div', 'sub', a ? `${a.lines.length}ページ` : 'まだ準備中です'));
    b.append(info, h('span', 'st-tag', a ? (seen ? '見た' : 'はじめる') : '準備中'));
    b.disabled = !a;
    if (a) b.onclick = () => ctx.go('story', { act: a.id });
    list.append(b);
  }
  wrap.append(list); root.append(wrap);
}

export const screens = { top, tutorial, story, stock, options, summon, summonFx, detail, tower, towerRoster, towerAdd, teamCodeMake, battleMenu, simSetup, pvpLobby, pvpSelect, auto, hotSetup, hotPlay, select, match };
