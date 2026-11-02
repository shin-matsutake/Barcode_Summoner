import { h } from './dom.js';
import { dialog, confirmDialog, toast } from './dialog.js';
import { portrait } from './portrait.js';
import { analyze } from '../core/jan.js';
import { battleDemo } from './battleView.js';
import { summon, summonFx, detail } from './summon.js';

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
  logo.append(h('h1', '', TITLE), barcodeStrip(), h('p', 'sub', 'バーコードから仲間を呼び出して戦う'));
  wrap.append(logo);
  const menu = h('nav', 'menu');
  const items = [
    ['召喚する', 'summon', '番号を入れて仲間を呼ぶ'],
    ['対戦する', null, '友達と合言葉で対戦'],
    ['CPUタワー', null, '5つのステージに挑戦'],
    ['ストック', 'stock', '召喚した仲間を見る'],
    ['オプション', 'options', '音量・演出・データ'],
  ];
  for (const [label, target, sub] of items) {
    const b = h('button', 'btn menu-btn' + (target ? '' : ' soon'));
    b.append(h('span', 'ml', label), h('span', 'ms', target ? sub : '準備中'));
    b.onclick = () => target ? ctx.go(target) : toast(`「${label}」はこれから追加します`);
    menu.append(b);
  }
  wrap.append(menu);
  const demo = h('button', 'btn demo-btn', 'バトル画面を試す（サンプル）');
  demo.onclick = () => ctx.go('battleDemo');
  wrap.append(demo, h('p', 'ver', `データ v${ctx.data.version}`));
  root.append(wrap);
}

function stock(root, ctx) {
  const wrap = h('div', 'page');
  wrap.append(backBar(ctx, 'ストック'));
  const list = h('div', 'list');
  const items = ctx.store.get().stock;
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
    row.append(info);
    list.append(row);
  }
  wrap.append(list);
  root.append(wrap);
}

function options(root, ctx) {
  const o = ctx.store.get().options;
  const save = () => ctx.store.update(() => {});
  const wrap = h('div', 'page');
  wrap.append(backBar(ctx, 'オプション'));
  const body = h('div', 'list');

  const slider = (label, key, note) => {
    const row = h('div', 'panel opt');
    const head = h('div', 'opt-head');
    const val = h('b', '', String(o[key]));
    head.append(h('span', '', label), val);
    const r = h('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = o[key];
    r.oninput = () => { o[key] = +r.value; val.textContent = r.value; };
    r.onchange = save;
    row.append(head, r);
    if (note) row.append(h('p', 'sub', note));
    return row;
  };
  const toggle = (label, key, note) => {
    const row = h('label', 'panel opt opt-toggle');
    const t = h('div'); t.append(h('span', '', label)); if (note) t.append(h('p', 'sub', note));
    const c = h('input'); c.type = 'checkbox'; c.checked = !!o[key];
    c.onchange = () => { o[key] = c.checked; save(); };
    row.append(t, c, h('i', 'sw'));
    return row;
  };
  body.append(slider('BGM音量', 'bgm'), slider('効果音の音量', 'se', '音の素材をフォルダに入れると鳴るようになります'));

  const tempo = h('div', 'panel opt');
  tempo.append(h('div', 'opt-head', ''));
  tempo.firstChild.append(h('span', '', 'バトルのテンポ'));
  const seg = h('div', 'seg');
  [['slow', 'ゆっくり'], ['normal', 'ふつう'], ['fast', 'はやい']].forEach(([v, l]) => {
    const b = h('button', 'seg-b' + (o.tempo === v ? ' on' : ''), l);
    b.onclick = () => { o.tempo = v; save(); seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b)); };
    seg.append(b);
  });
  tempo.append(seg);
  body.append(tempo,
    toggle('バトル演出', 'fx', 'ダメージを受けたときの揺れ'),
    toggle('相手のニックネームを表示', 'showFoeNick', 'オフにすると、相手のモンスターは本来の名前だけ表示します'));

  const dataBox = h('div', 'panel opt');
  dataBox.append(h('div', 'opt-head', ''));
  dataBox.firstChild.append(h('span', '', 'データ'));
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
  root.append(wrap);
}

export const screens = { top, stock, options, battleDemo, summon, summonFx, detail };
