// 召喚の演出：線で描く魔法陣。輪のふちに13桁の数字を並べて回す。
// 2つの軸：①バーコードの運（加算値の合計の割合）→ 粒子の量と魔法陣のふち
//          ②種の格（モンスター番号の範囲）→ 輪の数（063〜086＝2重／087〜098＝3重／000と099＝3重のあと砕ける）
import { h } from './dom.js';
import { portrait, EL } from './portrait.js';
import { analyze, baseValue, STAT_RULES, isValidFormat } from '../core/jan.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 200;   // 魔法陣の中心（viewBox 400×400）

// ---- 演出の段階を決める ----
export function fxLevel(jan, data) {
  const d = [...jan].map(Number);
  const luck = ['hp', 'atk', 'mat', 'spd'].reduce((a, k) => a + baseValue(d, STAT_RULES[k]), 0) / 396;   // 0〜1
  const tier = luck >= 0.70 ? 3 : luck >= 0.55 ? 2 : luck >= 0.40 ? 1 : 0;
  const id = analyze(jan, data).speciesId;
  const shatter = id === 0 || id === 99;
  const rings = shatter || id >= 87 ? 3 : id >= 63 ? 2 : 1;
  return { luck, tier, id, rings, shatter };
}

// テスト用：指定した段階になる、チェックデジットの正しい13桁を探す
export function findJan(data, { rank = 'normal', tier = 1 } = {}) {
  const ok = lv => (rank === 'shatter' ? lv.shatter : rank === '3' ? lv.rings === 3 && !lv.shatter : rank === '2' ? lv.rings === 2 : lv.rings === 1) && lv.tier === tier;
  for (let n = 0; n < 600000; n++) {
    let s = ''; for (let i = 0; i < 12; i++) s += Math.floor(Math.random() * 10);
    const sum = [...s].reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0);
    const jan = s + ((10 - (sum % 10)) % 10);
    if (ok(fxLevel(jan, data))) return jan;
  }
  return null;
}

// ---- 小さな部品 ----
const svg = (tag, attrs = {}, cls = '') => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (cls) e.setAttribute('class', cls);
  return e;
};
const pt = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
const seeded = jan => { let x = [...jan].reduce((a, c) => (a * 31 + +c + 7) >>> 0, 17) || 1; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296; };

// 輪の並び（外から内へ）。digits＝13桁の数字／ticks＝目盛り／runes＝印
const LAYOUT = {
  1: { bands: [[140, 180, 'digits']], star: 124, core: 46 },
  2: { bands: [[150, 180, 'digits'], [112, 138, 'ticks']], star: 98, core: 40 },
  3: { bands: [[158, 182, 'digits'], [128, 152, 'ticks'], [98, 122, 'runes']], star: 86, core: 34 },
};

function circle(r, cls = '', d = 0) {
  const c = svg('circle', { cx: C, cy: C, r, pathLength: 1 }, 'ln ' + cls);
  c.style.setProperty('--d', d + 's'); return c;
}
function polygon(r, start, cls, d) {
  const pts = [0, 1, 2].map(i => pt(r, start + i * 120)); pts.push(pts[0]);
  const p = svg('path', { d: 'M' + pts.map(q => q.map(v => v.toFixed(1)).join(',')).join(' L'), pathLength: 1 }, 'ln ' + cls);
  p.style.setProperty('--d', d + 's'); return p;
}

function buildCircle(jan, lv) {
  const L = LAYOUT[lv.rings], root = svg('svg', { viewBox: '0 0 400 400', class: 'mc-svg', 'aria-hidden': 'true' });
  const rnd = seeded(jan);
  const layers = [];   // 砕けるとき、飛び散らせる単位
  // ふち（運で変わる）
  const rim = svg('g', {}, 'rim'); rim.append(circle(L.bands[0][1] + 6, 'thin', 0));
  if (lv.tier >= 2) rim.append(circle(L.bands[0][1] + 11, 'thin', .15));
  if (lv.tier >= 3) rim.append(circle(L.bands[0][1] + 16, 'thin gold', .3));
  root.append(rim); layers.push(rim);

  L.bands.forEach(([r0, r1, kind], bi) => {
    const g = svg('g', {}, `band b${bi} ${kind}`), d0 = .2 + bi * .35;
    g.append(circle(r1, '', d0), circle(r0, '', d0 + .15));
    const mid = (r0 + r1) / 2;
    if (kind === 'digits') {
      const fs = Math.min(19, (r1 - r0) * .55), spin = svg('g', {}, 'spin');
      [...jan].forEach((ch, i) => {
        const a = i * 360 / 13, [x, y] = pt(mid, a);
        const t = svg('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': 'middle', dy: '.35em', 'font-size': fs, transform: `rotate(${a.toFixed(2)} ${x.toFixed(1)} ${y.toFixed(1)})` }, 'dg');
        t.textContent = ch; t.style.setProperty('--d', (.8 + i * .09) + 's'); spin.append(t);
        const [sx, sy] = pt(mid, a + 180 / 13);
        spin.append(svg('path', { d: `M${sx} ${sy - 3.2}l2.6 3.2l-2.6 3.2l-2.6 -3.2z`, transform: `rotate(${(a + 180 / 13).toFixed(2)} ${sx.toFixed(1)} ${sy.toFixed(1)})` }, 'dm'));
      });
      g.append(spin);
    } else if (kind === 'ticks') {
      const t = svg('circle', { cx: C, cy: C, r: mid }, 'tk'), per = 2 * Math.PI * mid / 72;
      t.style.strokeDasharray = `2 ${(per - 2).toFixed(2)}`; g.append(t);
    } else {
      const spin = svg('g', {}, 'spin rev');
      for (let i = 0; i < 26; i++) {
        const a = i * 360 / 26, len = 5 + Math.floor(rnd() * 3) * 5, [x1, y1] = pt(mid - len / 2, a), [x2, y2] = pt(mid + len / 2, a);
        spin.append(svg('path', { d: `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}` }, 'rn'));
      }
      g.append(spin);
    }
    root.append(g); layers.push(g);
  });

  const star = svg('g', {}, 'star'), sd = 1.3;
  star.append(polygon(L.star, 0, '', sd), polygon(L.star, 180, '', sd + .2), circle(L.star, 'thin', sd - .1));
  const core = svg('g', {}, 'core'); core.append(circle(L.core, '', sd + .5), circle(L.core * .55, 'thin', sd + .6));
  root.append(star, core); layers.push(star, core);
  return { root, layers };
}

// 運の量だけ粒子が立ちのぼる（見た目だけなので、数や位置は番号から決める）
function buildParticles(jan, lv) {
  const box = h('div', 'mc-parts'), rnd = seeded(jan + 'p'), n = 8 + Math.round(lv.luck * 56);
  for (let i = 0; i < n; i++) {
    const p = h('i', lv.tier >= 3 && i % 2 ? 'gold' : ''), a = rnd() * 6.283, r = 18 + rnd() * 30;
    p.style.cssText = `--x:${(50 + Math.cos(a) * r).toFixed(1)}%;--y:${(52 + Math.sin(a) * r * .9).toFixed(1)}%;--s:${(2 + rnd() * (lv.tier >= 2 ? 4 : 3)).toFixed(1)}px;--t:${(1.8 + rnd() * 2).toFixed(2)}s;--w:${(1 + rnd() * 2.2).toFixed(2)}s;--dx:${((rnd() - .5) * 36).toFixed(0)}px`;
    box.append(p);
  }
  return box;
}

// 砕けるときの破片
function buildShards(jan) {
  const box = h('div', 'mc-shards'), rnd = seeded(jan + 's');
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * 360 + rnd() * 12, s = h('i');
    s.style.cssText = `--a:${a.toFixed(0)}deg;--dist:${(150 + rnd() * 90).toFixed(0)}px;--w:${(10 + rnd() * 16).toFixed(0)}px;--rot:${(rnd() * 360).toFixed(0)}deg`;
    box.append(s);
  }
  return box;
}

// params: { jan, demo }（demo＝テスト用。保存せず、終わったら召喚の画面に戻る）
export function summonFx(root, ctx, { jan, demo = false }) {
  const p = analyze(jan, ctx.data), lv = fxLevel(jan, ctx.data);
  const fx = h('div', `sfx lk${lv.tier} rk${lv.rings}${lv.shatter ? ' shat' : ''}`);
  fx.style.setProperty('--el', EL[p.monster.el].c);
  const mc = h('div', 'mc');
  const { root: svgEl } = buildCircle(jan, lv);
  const pic = h('div', 'sfx-pic'); pic.append(portrait(p.monster, { view: 'front' }));
  mc.append(h('u', 'mc-glow'), svgEl, buildParticles(jan, lv), pic);
  if (lv.shatter) mc.append(buildShards(jan));
  const name = h('div', 'sfx-name'); name.append(h('span', '', '召喚成功'), h('b', '', p.monster.name));
  const skip = h('button', 'sfx-skip', 'タップで進む');
  fx.append(mc, name, h('u', 'flash'), skip);
  root.append(fx);
  let done = false;
  const next = () => { if (done) return; done = true; demo ? ctx.go('summon') : ctx.go('detail', { jan, isNew: true }); };
  fx.onclick = next;
  const t = setTimeout(next, lv.shatter ? 7600 : 6200);
  return () => { done = true; clearTimeout(t); };
}
