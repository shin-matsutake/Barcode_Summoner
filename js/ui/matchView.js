// バトル画面。勝ち抜き戦（1〜3体）に対応。自分が操作するモードと、CPU同士を観戦するモードがある。
import { h, sleep } from './dom.js';
import { dialog, confirmDialog, story } from './dialog.js';
import { enterStage } from './modes.js';
import { stageOf } from '../data.js';
import { portrait, elemIcon, EL } from './portrait.js';
import { analyze } from '../core/jan.js';
import { Rng } from '../core/rng.js';
import { allowedSlots, rageMult, effStat, CONFIG } from '../core/battle.js';
import { startSeries, resolveSeriesTurn } from '../core/series.js';
import { chooseSlot } from './ai.js';

const TIMER_SEC = 30;
const DELAY = { slow: 1500, normal: 1000, fast: 550 };
const KIND = ['技A', '技B', '固有'];
const TYPE = { phys: '物理', mag: '魔法' };
const pct = v => Math.round(v * 100) + '%';

// params: { kind:'tower'|'quick', stage, mineJans, foeJans, ai, aiA, watch, teamIdx }
export function match(root, ctx, params) {
  const opts = ctx.store.get().options;
  const rng = new Rng(Date.now());
  const watch = !!params.watch, aiB = params.ai || 1, aiA = params.aiA || 1;
  const teamA = params.mineJans.map(j => analyze(j, ctx.data)), teamB = params.foeJans.map(j => analyze(j, ctx.data));
  const s = startSeries(teamA, teamB);
  const label = watch ? { a: 'A', b: 'B' } : { a: 'あなた', b: '相手' };
  let alive = true, timerId = 0, locked = true, paused = false, speed = 1, tLeft = TIMER_SEC;
  const waiters = [];

  const bt = h('div', 'bt');
  const top = h('header', 'bt-top');
  const menuBtn = h('button', 'btn small', watch ? 'やめる' : 'メニュー');
  top.append(menuBtn, h('span', 'bt-title', params.kind === 'tower' ? `CPUタワー ステージ${params.stage}` : 'クイックバトル'));

  // ---- HUD（名前・HP・属性・耐性。自分側はタップで能力値） ----
  function buildHud(w) {
    const p = h('section', `hud panel ${w === 'b' ? 'foe' : 'me'}`);
    const iconSlot = h('div', 'hud-icon'), info = h('div', 'hud-info');
    const nameRow = h('div', 'hud-name'), nameB = h('b'), who = h('em', '', label[w]), dots = h('span', 'dots');
    nameRow.append(nameB, who, dots);
    const hpRow = h('div', 'hp-row'), bar = h('div', 'hp-bar'), fill = h('i'), num = h('span', 'hp-num');
    bar.append(fill); hpRow.append(h('span', 'hp-l', 'HP'), bar, num);
    const meta = h('div', 'hud-meta');
    info.append(nameRow, hpRow, meta);
    let stats = null;
    if (w === 'a' && !watch) {
      stats = h('div', 'hud-stats');
      nameRow.append(h('small', 'hud-hint', 'タップで能力値'));
      p.classList.add('tappable'); p.tabIndex = 0; p.setAttribute('role', 'button');
      const tog = () => { stats.classList.toggle('open'); p.classList.toggle('open'); };
      p.onclick = tog; p.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } };
      info.append(stats);
    }
    p.append(iconSlot, info);
    return { el: p, iconSlot, nameB, dots, fill, num, meta, stats };
  }
  const huds = { a: buildHud('a'), b: buildHud('b') };
  const sides = { a: h('div', 'side me-side'), b: h('div', 'side foe-side') };

  function setHp(w, hp, f) {
    const u = huds[w], r = Math.max(0, hp) / f.maxHp;
    u.fill.style.width = (r * 100) + '%';
    u.fill.className = r > 0.5 ? 'g' : r > 0.25 ? 'y' : 'r';
    u.num.textContent = `${Math.max(0, hp)}/${f.maxHp}`;
  }
  function showFighter(w, f) { // 登場時に、パネルと絵を入れ替える
    const u = huds[w];
    u.iconSlot.replaceChildren(portrait(f.profile.monster, { view: 'icon', cls: 'sm' }));
    u.nameB.textContent = f.name;
    u.meta.replaceChildren(elemIcon(f.el, 'sm'), h('span', '', `物理耐性 ${pct(f.profile.res.phys)}　魔法耐性 ${pct(f.profile.res.mag)}`));
    const total = s.teams[w].length, remain = total - s.idx[w];
    u.dots.textContent = total > 1 ? '●'.repeat(remain) + '○'.repeat(total - remain) : '';
    sides[w].replaceChildren(portrait(f.profile.monster, { view: w === 'a' ? 'back' : 'front' }));
    setHp(w, f.hp, f);
  }

  const arena = h('div', 'arena');
  const mid = h('div', 'mid');
  const turnBox = h('div', 'turn'), turnNum = h('b'), rage = h('span', 'rage');
  turnBox.append(h('span', '', 'TURN'), turnNum, rage);
  const warn = h('div', 'warn'), msg = h('div', 'msg panel'), m1 = h('div', 'm1'), m2 = h('div', 'm2');
  msg.append(m1, m2);
  mid.append(turnBox, msg, warn);
  arena.append(sides.b, mid, sides.a);

  const timer = h('div', 'timer'), tfill = h('i'), tnum = h('b'); timer.append(tfill, tnum);
  const skills = h('div', 'skills');
  const ctl = h('div', 'watch-ctl');
  if (watch) {
    const pb = h('button', 'btn', '一時停止'), sp = h('button', 'btn', '速さ ×1');
    pb.onclick = () => { paused = !paused; pb.textContent = paused ? '再開' : '一時停止'; if (!paused) waiters.splice(0).forEach(r => r()); };
    sp.onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; sp.textContent = `速さ ×${speed}`; };
    ctl.append(pb, sp);
    bt.append(top, huds.b.el, arena, huds.a.el, ctl);
  } else bt.append(top, huds.b.el, arena, huds.a.el, timer, skills);
  root.append(bt);

  // メッセージは2行固定。引数は、文字列、または [{t:文字, c:色}] の配列（技名を属性の色にするため）
  const fillLine = (el, parts) => { el.replaceChildren(); for (const p of (Array.isArray(parts) ? parts : [{ t: String(parts) }])) { const sp = h('span', '', p.t); if (p.c) sp.style.color = p.c; el.append(sp); } };
  const say = (l1, l2 = '') => { fillLine(m1, l1); fillLine(m2, l2); };
  const fa = () => s.fighters.a;
  const gate = async () => { while (paused && alive) await new Promise(r => waiters.push(r)); };
  const wait = async ms => { await sleep(ms / speed); await gate(); };

  function renderStats() {
    const u = huds.a.stats; if (!u) return;
    const f = fa(), t = s.battle.turn;
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
  function hitFx(w, dmg, type, color) {
    const el = sides[w];
    el.style.setProperty('--fx', color);   // ダメージの数字と、エフェクトは、技の属性の色
    if (opts.fx) {
      el.classList.remove('shake', 'mag'); void el.offsetWidth; el.classList.add(type === 'mag' ? 'mag' : 'shake');
      const fx = h('div', type === 'mag' ? 'fxm' : 'fxs');   // 物理＝斬撃の線、魔法＝光の輪
      fx.innerHTML = type === 'mag' ? '<i></i><i></i>' : '<svg viewBox="0 0 100 100"><path pathLength="1" d="M12 18L88 82"/><path pathLength="1" d="M34 8L92 60"/><path pathLength="1" d="M8 44L58 94"/></svg>';
      el.append(fx); setTimeout(() => fx.remove(), 800);
    }
    const n = h('div', 'dmg', String(dmg)); el.append(n); setTimeout(() => n.remove(), 900);
  }
  const advance = async w => {   // 攻撃側が前に出る（自分は上へ、相手は下へ）
    if (!opts.fx) return;
    const el = sides[w]; el.classList.remove('adv'); void el.offsetWidth; el.classList.add('adv');
    await wait(260);
  };
  // 鎖と南京錠（線画）。連続して使えない技にかぶせる
  const LOCK_SVG = (() => {
    let links = '';
    for (let k = 0; k < 11; k++) { const x = 14 + k * 27; links += k % 2 ? `<ellipse cx="${x}" cy="30" rx="5" ry="10"/>` : `<ellipse cx="${x}" cy="30" rx="13" ry="8"/>`; }
    return `<svg viewBox="0 0 300 60" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke="#aebdcb" stroke-width="3.5" transform="rotate(-6 150 30)">${links}</g><g transform="translate(150 33)"><path d="M-9 -2V-10a9 9 0 0 1 18 0V-2" fill="none" stroke="#e0b93a" stroke-width="5"/><rect x="-15" y="-3" width="30" height="24" rx="4" fill="#e0b93a" stroke="#6b5413" stroke-width="2"/><circle cx="0" cy="8" r="3" fill="#6b5413"/><rect x="-1.5" y="9" width="3" height="7" fill="#6b5413"/></g></svg>`;
  })();

  function renderSkills() {
    skills.replaceChildren();
    const f = fa(), ok = allowedSlots(f, s.battle.turn);
    f.profile.slots.forEach((sk, i) => {
      const b = h('button', 'skill' + (ok.includes(i) ? '' : ' wait'));
      b.style.setProperty('--el', EL[sk.el].c);
      if (sk.kind === 'U') b.classList.add('uniq');
      const head = h('div', 'sk-head');
      head.append(h('span', 'sk-kind', KIND[i]), h('b', 'sk-name', sk.name), elemIcon(sk.el, 'sm'),
        h('span', `tbadge tb-${sk.type}`, TYPE[sk.type]), h('span', 'sk-pow', `威力 ${sk.power}`));
      b.append(head);
      b.append(h('div', 'sk-text', sk.text));
      if (!ok.includes(i)) { const lk = h('div', 'chain'); lk.innerHTML = LOCK_SVG; b.append(lk); }
      let pressed = false, pt = 0;
      b.onpointerdown = () => { pressed = false; pt = setTimeout(() => { pressed = true; dialog({ title: sk.name, text: `${EL[sk.el].ja}属性・${TYPE[sk.type]}攻撃・威力 ${sk.power}\n${sk.text}` }); }, 500); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => clearTimeout(pt);
      b.oncontextmenu = e => e.preventDefault();
      b.onclick = () => {
        if (pressed) { pressed = false; return; }
        if (!ok.includes(i)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }   // ロック中は、小さく震える
        if (!locked) commit(i);
      };
      skills.append(b);
    });
  }

  function stopTimer() { clearInterval(timerId); }
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
  async function beginTurn() {
    setTurn(s.battle.turn);
    if (watch) { locked = true; say(`${s.fighters.a.name} VS ${s.fighters.b.name}`); await wait(700); if (alive) commit(null); return; }
    renderSkills();
    const ok = allowedSlots(fa(), s.battle.turn);
    if (!ok.length) { locked = true; say(`${fa().name}は動けない…`); tnum.textContent = '--'; sleep(1000).then(() => alive && commit(null)); return; }
    locked = false; say('技を選んでください'); startTimer(ok);
  }

  async function commit(slotA) {
    if (!alive) return;
    locked = true; stopTimer(); skills.classList.add('lock');
    const t = s.battle.turn, view = { a: s.fighters.a, b: s.fighters.b };
    if (watch) slotA = chooseSlot(view.a, view.b, t, rng, aiA);
    const slotB = chooseSlot(view.b, view.a, t, rng, aiB);
    const ev = resolveSeriesTurn(s, slotA, slotB, rng);
    const d = DELAY[opts.tempo] || 1000;
    const nm = w => view[w].name;
    // ヒットの種別と属性（物理／魔法）。追加攻撃・反撃・相手技のコピーで変わる場合に対応する（表示用の推定）
    const hitN = { a: 0, b: 0 }, nul = { a: false, b: false };
    const slotOf = e => view[e.who].profile.slots.find(x => x.name === e.skill);
    const hitInfo = e => {
      const sk = slotOf(e), n = hitN[e.who]++, att = view[e.who];
      const dflt = { type: sk ? sk.type : 'phys', el: sk ? sk.el : att.el };
      if (!sk) return dflt;
      const ef = sk.effects || [];
      if (e.counter) { const o = ef.find(x => x.op === 'counterOnSelfKO'); return { type: o ? o.type : sk.type, el: sk.el }; }
      const extras = ef.filter(o => o.op === 'extra' && (!nul[e.who] || o.cond === 'clash')).map(o => ({ type: o.type, el: sk.el }));
      const foeIdx = e.who === 'a' ? slotB : slotA, foeSk = foeIdx != null ? view[e.who === 'a' ? 'b' : 'a'].profile.slots[foeIdx] : null;
      const list = nul[e.who] ? extras : [{ type: sk.type, el: sk.el }, ...extras, ...(ef.some(o => o.op === 'copyFoe') && foeSk ? [{ type: foeSk.type, el: foeSk.el }] : [])];
      return list[n] || dflt;
    };
    const col = sk => EL[sk ? sk.el : 'dark'].c;
    const skOf = w => { const i = w === 'a' ? slotA : slotB; return i != null ? view[w].profile.slots[i] : null; };
    let mutualShown = false;
    for (const e of ev) {
      if (!alive) return;
      let w = d;
      switch (e.t) {
        case 'turn': setTurn(e.turn); say(`ターン${e.turn}`); w = d * 0.6; break;
        case 'clash': {
          if (e.a && e.b) {   // 相殺
            mutualShown = true; const sa = skOf('a'), sb = skOf('b');
            say([{ t: `${nm('a')}の` }, { t: sa ? sa.name : '', c: col(sa) }, { t: `と${nm('b')}の` }, { t: sb ? sb.name : '', c: col(sb) }, { t: 'が' }], '打ち消し合った！');
          } else w = 0;       // 片方だけの打消しは、'nullified' で表示する
          break;
        }
        case 'nullified': {
          if (mutualShown) { nul[e.who] = true; w = 0; break; }
          nul[e.who] = true; const win = e.who === 'a' ? 'b' : 'a', sw = skOf(win), sl = skOf(e.who);
          say([{ t: `${nm(win)}の` }, { t: sw ? sw.name : '', c: col(sw) }, { t: 'が' }], [{ t: `${nm(e.who)}の` }, { t: e.skill, c: col(sl) }, { t: 'を打ち消した！' }]);
          break;
        }
        case 'stunned': say(`${nm(e.who)}は動けない！`); break;
        case 'hit': {
          const tgt = e.who === 'a' ? 'b' : 'a', hi = hitInfo(e), c = EL[hi.el].c;
          if (e.counter) say(`${nm(e.who)}の反撃！`, `${TYPE[hi.type]}攻撃　${e.dmg}ダメージ`);
          else say([{ t: `${nm(e.who)}の` }, { t: e.skill, c }, { t: '！' }], `${TYPE[hi.type]}攻撃　${e.dmg}ダメージ`);
          await advance(e.who);
          hitFx(tgt, e.dmg, hi.type, c); setHp(tgt, e.foeHp, view[tgt]); break;
        }
        case 'heal': say(`${nm(e.who)}は回復した！`, `HPが${e.n}回復`); setHp(e.who, e.hp, view[e.who]); break;
        case 'selfDamage': say(`${nm(e.who)}は${e.cause === 'recoil' ? '反動を受けた' : '自分にダメージを受けた'}！`, `${e.n}ダメージ`); setHp(e.who, e.hp, view[e.who]); break;
        case 'hpSet': say(`${nm(e.target)}のHPが0になった！`); setHp(e.target, e.hp, view[e.target]); break;
        case 'judgeWin': say(`${nm(e.who === 'a' ? 'b' : 'a')}は自分の効果で倒れた！`); break;
        case 'faint': say(`${nm(e.who)}は倒れた！`); break;
        case 'mutualKO': say(`${CONFIG.MAX_TURNS}ターンが終わった`, '相打ちになった'); break;
        case 'enter': view[e.who] = s.fighters[e.who]; showFighter(e.who, view[e.who]); say(`${e.name}が登場！`); break;
        default: w = 0;
      }
      if (w) await wait(w);
    }
    if (!s.over) { showFighter('a', s.fighters.a); showFighter('b', s.fighters.b); } else { setHp('a', s.fighters.a.hp, s.fighters.a); setHp('b', s.fighters.b.hp, s.fighters.b); }
    renderStats(); skills.classList.remove('lock');
    if (s.over) return finish();
    beginTurn();
  }

  async function finish() {
    const r = s.result;
    const text = watch ? (r === 'a' ? 'Aの勝ち！' : r === 'b' ? 'Bの勝ち！' : '引き分け') : (r === 'a' ? 'あなたの勝ち！' : r === 'b' ? 'あなたの負け…' : '引き分け');
    const retry = () => ctx.go('match', { ...params });
    if (params.kind === 'quick') {
      const c = await dialog({ title: '決着', text, buttons: [{ label: 'トップへ', value: 'top' }, { label: '別の2体で', value: 'new' }, { label: 'もう一度', value: 'again', primary: true }] });
      if (!alive) return;
      return c === 'again' ? retry() : c === 'new' ? ctx.go('quick') : ctx.go('top');
    }
    const stage = params.stage, stg = stageOf(ctx.data, stage), hasNext = !!stageOf(ctx.data, stage + 1);
    if (r === 'a') {
      ctx.store.update(st => { st.tower.cleared = Math.max(st.tower.cleared, stage); });
      if (stg && stg.outro) { await story(stg.outro, `ステージ${stage}`); if (!alive) return; }
      const btns = [{ label: 'タワーへ', value: 'tower' }];
      if (hasNext) btns.push({ label: '次のステージへ', value: 'next', primary: true });
      const c = await dialog({ title: `ステージ${stage} クリア！`, text: hasNext ? text : `${text}\n\nすべてのステージをクリアしました！\nタワーの画面の「もう一度挑戦」から、最初に戻れます。`, buttons: btns });
      if (!alive) return;
      return c === 'next' ? enterStage(ctx, stage + 1) : ctx.go('tower');
    }
    const c = await dialog({ title: '決着', text, buttons: [{ label: 'タワーへ', value: 'tower' }, { label: '選出からやり直す', value: 'again', primary: true }] });
    if (!alive) return;
    ctx.go(c === 'again' ? 'select' : 'tower', c === 'again' ? { stage, teamIdx: params.teamIdx, restore: true } : {});
  }

  menuBtn.onclick = async () => {
    stopTimer(); const remain = tLeft, wasLocked = locked; locked = true; const wasPaused = paused; paused = true;
    const quit = await confirmDialog(watch ? '観戦をやめて、戻りますか？' : 'バトルをやめて、戻りますか？', watch ? 'やめる' : 'ギブアップ', '続ける');
    if (quit) { alive = false; waiters.splice(0).forEach(r => r()); return ctx.go(params.kind === 'quick' ? 'quick' : 'tower'); }
    paused = wasPaused; if (!paused) waiters.splice(0).forEach(r => r());
    locked = wasLocked; if (!watch && !wasLocked && alive) startTimer(allowedSlots(fa(), s.battle.turn), remain);
  };

  showFighter('a', s.fighters.a); showFighter('b', s.fighters.b);
  setTurn(1); say('');
  if (!watch) renderSkills();
  dialog({ text: params.kind === 'tower' ? `ステージ${params.stage}\nバトル開始！` : 'バトル開始！', buttons: [], auto: 1300 }).then(() => alive && beginTurn());
  return () => { alive = false; stopTimer(); waiters.splice(0).forEach(r => r()); };
}
