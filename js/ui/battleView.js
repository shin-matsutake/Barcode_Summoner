// バトル画面（サンプル）。コアの本物の戦闘計算を使い、自分 VS CPU の1対1を遊べる。
import { h, sleep } from './dom.js';
import { dialog, confirmDialog } from './dialog.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { Rng } from '../core/rng.js';
import { createFighter, newBattle, resolveTurn, allowedSlots, aiChoose, rageMult, effStat, CONFIG } from '../core/battle.js';

const SAMPLE_ME = '4901234567894';
const SAMPLE_FOE = '4549131234567';
const TIMER_SEC = 30;
const DELAY = { slow: 1500, normal: 1000, fast: 550 };
const KIND = ['技A', '技B', '固有'];
const TYPE = { phys: '物理', mag: '魔法' };
const pct = v => Math.round(v * 100) + '%';

export function battleDemo(root, ctx) {
  const opts = ctx.store.get().options;
  const rng = new Rng(Date.now());
  const pa = analyze(SAMPLE_ME, ctx.data), pb = analyze(SAMPLE_FOE, ctx.data);
  const st = newBattle(createFighter(pa), createFighter(pb));
  let alive = true, timerId = 0, locked = true;

  const bt = h('div', 'bt');
  // 上のバー
  const top = h('header', 'bt-top');
  const menuBtn = h('button', 'btn small', 'メニュー');
  top.append(menuBtn, h('span', 'bt-title', 'バーコード・サモナー'));
  // パネル（敵・自分）
  const hud = (f, side) => {
    const p = h('section', `hud panel ${side}`);
    const icon = portrait(f.profile.monster, { view: 'icon', cls: 'sm' });
    const info = h('div', 'hud-info');
    const nameRow = h('div', 'hud-name');
    nameRow.append(h('b', '', f.name), h('em', '', side === 'foe' ? '相手' : 'あなた'));
    const hpRow = h('div', 'hp-row');
    const bar = h('div', 'hp-bar'); const fill = h('i'); bar.append(fill);
    const num = h('span', 'hp-num');
    hpRow.append(h('span', 'hp-l', 'HP'), bar, num);
    const meta = h('div', 'hud-meta');
    meta.append(elemIcon(f.el, 'sm'), h('span', '', `物理耐性 ${pct(f.profile.res.phys)}　魔法耐性 ${pct(f.profile.res.mag)}`));
    info.append(nameRow, hpRow, meta);
    let stats = null;
    if (side === 'me') { // 自分のパネルをタップすると能力値が開く（相手の能力値は見せない）
      stats = h('div', 'hud-stats');
      nameRow.append(h('small', 'hud-hint', 'タップで能力値'));
      p.classList.add('tappable'); p.tabIndex = 0; p.setAttribute('role', 'button');
      const tog = () => { stats.classList.toggle('open'); p.classList.toggle('open'); };
      p.onclick = tog; p.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } };
      info.append(stats);
    }
    p.prepend(icon); p.append(info);
    return { el: p, fill, num, stats };
  };
  const foeHud = hud(st.b, 'foe'), meHud = hud(st.a, 'me');
  // 場
  const arena = h('div', 'arena');
  const foeSide = h('div', 'side foe-side'), meSide = h('div', 'side me-side');
  foeSide.append(portrait(pb.monster, { view: 'front' }));
  meSide.append(portrait(pa.monster, { view: 'back' }));
  const mid = h('div', 'mid');
  const turnBox = h('div', 'turn'); const turnNum = h('b'); const rage = h('span', 'rage');
  turnBox.append(h('span', '', 'TURN'), turnNum, rage);
  const warn = h('div', 'warn');
  const msg = h('div', 'msg panel');
  mid.append(turnBox, msg, warn);
  arena.append(foeSide, mid, meSide);
  // タイマーと技
  const timer = h('div', 'timer'); const tfill = h('i'); const tnum = h('b');
  timer.append(tfill, tnum);
  const skills = h('div', 'skills');
  bt.append(top, foeHud.el, arena, meHud.el, timer, skills);
  root.append(bt);

  const hpOf = side => side === 'a' ? st.a : st.b;
  function setHp(side, hp) {
    const f = hpOf(side), u = side === 'a' ? meHud : foeHud;
    const r = Math.max(0, hp) / f.maxHp;
    u.fill.style.width = (r * 100) + '%';
    u.fill.className = r > 0.5 ? 'g' : r > 0.25 ? 'y' : 'r';
    u.num.textContent = `${Math.max(0, hp)}/${f.maxHp}`;
  }
  function renderStats() {
    const u = meHud.stats; if (!u) return;
    const f = st.a, t = st.turn;
    const rows = [['攻撃', 'atk', f.base.atk], ['魔法攻撃', 'mat', f.base.mat], ['SPD', 'spd', f.base.spd]]
      .map(([l, k, b]) => [l, Math.round(effStat(f, k, t)), b, false])
      .concat([['物理耐性', 'pres', f.base.pres], ['魔法耐性', 'mres', f.base.mres]].map(([l, k, b]) => [l, effStat(f, k, t), b, true]));
    u.replaceChildren();
    for (const [l, v, b, isRes] of rows) {
      const c = h('div', 'st-cell' + (v > b ? ' up' : v < b ? ' down' : ''));
      c.append(h('span', '', l), h('b', '', isRes ? pct(v) : String(v)));
      u.append(c);
    }
  }
  function setTurn(t) {
    turnNum.textContent = t;
    rage.textContent = t >= CONFIG.RAGE_START ? `RAGE ×${rageMult(t).toFixed(1)}` : '';
    renderStats();
    warn.textContent = t >= CONFIG.WARN_TURN ? `あと${CONFIG.MAX_TURNS - t + 1}ターンで相打ち` : '';
  }
  const say = t => { msg.textContent = t; };
  function hitFx(side, dmg, type, elColor) {
    const el = side === 'a' ? meSide : foeSide;
    if (opts.fx) {
      el.classList.remove('shake', 'mag'); void el.offsetWidth;
      el.style.setProperty('--fx', elColor);
      el.classList.add(type === 'mag' ? 'mag' : 'shake');
    }
    const n = h('div', 'dmg', String(dmg)); el.append(n); setTimeout(() => n.remove(), 900);
  }

  function renderSkills() {
    skills.replaceChildren();
    const ok = allowedSlots(st.a, st.turn);
    pa.slots.forEach((s, i) => {
      const b = h('button', 'skill' + (ok.includes(i) ? '' : ' wait'));
      b.style.setProperty('--el', EL[s.el].c);
      if (s.kind === 'U') b.classList.add('uniq');
      const head = h('div', 'sk-head');
      head.append(h('span', 'sk-kind', KIND[i]), h('b', 'sk-name', s.name), elemIcon(s.el, 'sm'),
        h('span', `tbadge tb-${s.type}`, TYPE[s.type]), h('span', 'sk-pow', `威力 ${s.power}`));
      b.append(head);
      if (!ok.includes(i)) b.append(h('div', 'sk-meta', '連続して使えません'));
      b.append(h('div', 'sk-text', s.text));
      let pressed = false, pt = 0;
      b.onpointerdown = () => { pressed = false; pt = setTimeout(() => { pressed = true; dialog({ title: s.name, text: `${EL[s.el].ja}属性・${TYPE[s.type]}攻撃・威力 ${s.power}\n${s.text}` }); }, 500); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => clearTimeout(pt);
      b.oncontextmenu = e => e.preventDefault();
      b.onclick = () => { if (pressed) { pressed = false; return; } if (!locked && ok.includes(i)) commit(i); };
      skills.append(b);
    });
  }

  function stopTimer() { clearInterval(timerId); }
  let tLeft = TIMER_SEC;
  function startTimer(ok, from = TIMER_SEC) {
    const t0 = performance.now();
    const tick = () => {
      const left = tLeft = Math.max(0, from - (performance.now() - t0) / 1000);
      tfill.style.width = (left / TIMER_SEC * 100) + '%';
      tnum.textContent = Math.ceil(left) + 's';
      if (left <= 0) { stopTimer(); if (!locked) commit(ok[Math.floor(Math.random() * ok.length)]); } // 時間切れは本人側でランダムに選ぶ
    };
    tick(); timerId = setInterval(tick, 100);
  }
  function beginTurn() {
    setTurn(st.turn); renderSkills();
    const ok = allowedSlots(st.a, st.turn);
    if (!ok.length) { locked = true; say(`${st.a.name}は動けない…`); tnum.textContent = '--'; sleep(1000).then(() => alive && commit(null)); return; }
    locked = false; say('技を選んでください'); startTimer(ok);
  }

  async function commit(slotA) {
    if (!alive) return;
    locked = true; stopTimer(); skills.classList.add('lock');
    const slotB = aiChoose(st.b, st.turn, rng);
    const ev = resolveTurn(st, slotA, slotB, rng);
    const d = DELAY[opts.tempo] || 1000;
    const nm = w => hpOf(w).name;
    // ヒットの種別（物理／魔法）。追加攻撃で種別が変わる技にも対応する（打ち消された技は追加攻撃だけが通る）
    const hitN = { a: 0, b: 0 }, nul = { a: false, b: false };
    const hitType = e => {
      const slot = hpOf(e.who).profile.slots.find(x => x.name === e.skill);
      const n = hitN[e.who]++;
      if (!slot) return 'phys';
      const extras = (slot.effects || []).filter(o => o.op === 'extra' && (!nul[e.who] || o.cond === 'clash'));
      if (nul[e.who]) return (extras[n] || extras[0] || slot).type;
      return n === 0 ? slot.type : (extras[n - 1] || slot).type;
    };
    for (const e of ev) {
      if (!alive) return;
      let wait = d;
      switch (e.t) {
        case 'turn': setTurn(e.turn); say(`ターン${e.turn}`); wait = d * 0.6; break;
        case 'clash': say('属性がぶつかり合った！'); break;
        case 'nullified': nul[e.who] = true; say(`${nm(e.who)}の${e.skill}は打ち消された！`); break;
        case 'stunned': say(`${nm(e.who)}は動けない！`); break;
        case 'hit': {
          const tgt = e.who === 'a' ? 'b' : 'a', ty = hitType(e);
          const slot = hpOf(e.who).profile.slots.find(x => x.name === e.skill);
          say(`${nm(e.who)}の${e.skill}！（${TYPE[ty]}攻撃）　${e.dmg}ダメージ`);
          hitFx(tgt, e.dmg, ty, EL[slot ? slot.el : hpOf(e.who).el].c); setHp(tgt, e.foeHp); break;
        }
        case 'heal': say(`${nm(e.who)}はHPを${e.n}回復した`); setHp(e.who, e.hp); break;
        case 'selfDamage': say(`${nm(e.who)}は${e.n}のダメージを受けた`); setHp(e.who, e.hp); break;
        case 'hpSet': say(`${nm(e.target)}のHPが0になった`); setHp(e.target, e.hp); break;
        case 'faint': say(`${nm(e.who)}は倒れた！`); break;
        case 'mutualKO': say(`${CONFIG.MAX_TURNS}ターンが終わり、相打ちになった`); break;
        default: wait = 0;
      }
      if (wait) await sleep(wait);
    }
    setHp('a', st.a.hp); setHp('b', st.b.hp); renderStats();
    skills.classList.remove('lock');
    if (st.over) return finish();
    beginTurn();
  }

  async function finish() {
    const text = st.result === 'a' ? 'あなたの勝ち！' : st.result === 'b' ? 'あなたの負け…' : '引き分け';
    const r = await dialog({ title: '決着', text, buttons: [{ label: 'トップへ', value: 'top' }, { label: 'もう一度', value: 'again', primary: true }] });
    if (!alive) return;
    ctx.go(r === 'again' ? 'battleDemo' : 'top');
  }

  menuBtn.onclick = async () => {
    stopTimer(); const remain = tLeft; const wasLocked = locked; locked = true;
    if (await confirmDialog('バトルをやめて、トップに戻りますか？', 'ギブアップ', '続ける')) { alive = false; ctx.go('top'); return; }
    locked = wasLocked; if (!wasLocked && alive) startTimer(allowedSlots(st.a, st.turn), remain);
  };

  setHp('a', st.a.hp); setHp('b', st.b.hp);
  dialog({ text: 'バトル開始！', buttons: [], auto: 1200 }).then(() => alive && beginTurn());
  setTurn(1); renderSkills(); say('');
  return () => { alive = false; stopTimer(); };
}
