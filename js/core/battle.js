import { beats, weakAgainst, CONFIG as C } from './rules.js';
export { CONFIG } from './rules.js';

export function rageMult(turn) {
  return turn < C.RAGE_START ? 1 : 1.5 + C.RAGE_STEP * (turn - C.RAGE_START);
}
export function createFighter(profile) {
  const cz = (v, k) => C.COMPRESS === 1 ? v : Math.max(1, Math.round(C.COMPRESS_MEAN[k] + C.COMPRESS * (v - C.COMPRESS_MEAN[k])));
  const hp0 = cz(profile.stats.hp, 'hp');
  return {
    profile, el: profile.monster.el, name: profile.monster.name,
    hp: hp0, maxHp: hp0, takenThis: 0, takenLast: 0, endured: false,
    base: { atk: cz(profile.stats.atk, 'atk'), mat: cz(profile.stats.mat, 'mat'), spd: cz(profile.stats.spd, 'spd'),
            pres: profile.res.phys, mres: profile.res.mag },
    mods: [], prevSlot: null, stunTurn: -1,
    cur: {}, pending: {},  // 今ターンに有効な「次のターン効果」／次ターンへ持ち越す効果
  };
}
const active = (m, turn) => m.from <= turn && turn <= m.until;
export function effStat(f, key, turn) {
  const ms = f.mods.filter(m => m.stat === key && active(m, turn));
  if (key === 'pres' || key === 'mres') {
    const v = f.base[key] + ms.reduce((a, m) => a + (m.add || 0), 0);
    return Math.max(0, Math.min(C.RES_MAX, v));
  }
  const mult = ms.reduce((a, m) => a * (m.mult || 1), 1);
  return f.base[key] * Math.max(C.STAT_MIN, Math.min(C.STAT_MAX, mult));
}
// skill: {el,type,power}  opts: {ignoreRes}
export function calcDamage(att, skill, def, turn, opts = {}) {
  let power = skill.power;
  if (weakAgainst(att.el).includes(skill.el)) power *= C.MISMATCH; // 不一致逆補正
  const match = skill.el === att.el, adv = beats(skill.el, def.el);
  const dis = !adv && beats(def.el, skill.el);   // 不利：相手の属性が、この技の属性に強い
  let mult = match && adv ? C.COMBO : match ? C.MATCH : adv ? C.ADV : 1;
  if (dis) mult *= C.DISADV;
  const phys = skill.type === 'phys';
  const stat = effStat(att, opts.stat || (phys ? 'atk' : 'mat'), turn); // opts.stat='spd' なら、素早さを攻撃力として使う
  const res = opts.ignoreRes ? 0 : effStat(def, phys ? 'pres' : 'mres', turn);
  const ls = (C.LASTSTAND_THR && att.hp <= att.maxHp * C.LASTSTAND_THR) ? C.LASTSTAND_MULT : 1;
  const raw = (stat + power) * C.DAMAGE_K * mult * (1 - res) * rageMult(turn) * ls;
  return Math.max(C.MIN_DMG, Math.round(raw));
}
// 前のターンに使った枠だけが使えない。行動不能のターンは選べない
export function allowedSlots(f, turn) {
  if (f.stunTurn === turn) return [];
  return [0, 1, 2].filter(i => i !== f.prevSlot);
}
export function aiChoose(f, turn, rng) {
  const a = allowedSlots(f, turn);
  return a.length ? rng.pick(a) : null;
}
const ops = sk => (sk && sk.effects) || [];
const hasOp = (sk, name) => ops(sk).find(o => o.op === name);

export function newBattle(fa, fb) {
  return { turn: 1, a: fa, b: fb, over: false, result: null, log: [] };
}
// cond: 'first' | 'last' | 'foeHpHigher' | 'foeHpLower' | 'foeEl:xxx'（未指定なら常に成立）
function condOk(cond, c) {
  if (!cond) return true;
  if (cond === 'first') return c.isFirst && !c.orderOff;
  if (cond === 'last') return !c.isFirst && !c.orderOff;
  if (cond === 'foeHpHigher') return c.pre.foe > c.pre.me;
  if (cond === 'foeHpLower') return c.pre.foe < c.pre.me;
  if (cond.startsWith('foeEl:')) return c.foe.el === cond.slice(6);
  if (cond === 'nullifiedFoe') return !!c.foeNullified;            // 自分の技が相手の攻撃を打ち消した
  if (cond === 'clash') return !!c.clash;                          // このターン打ち消しが発生した（自分が打ち消された場合も含む）
  if (cond.startsWith('foeSkillEl:')) return !!c.foeSk && c.foeSk.el === cond.slice(11); // 相手の技の属性
  if (cond === 'afterFoeHpHigher') { const l = c.live(); return l.foe > l.me; }   // 攻撃後（その時点のHP）で相手が多い
  if (cond === 'afterFoeHpLower') { const l = c.live(); return l.foe < l.me; }    // 攻撃後（その時点のHP）で相手が少ない
  return false;
}
function perform(me, foe, sk, isFirst, turn, ev, who, orderOff, x = {}) {
  const live = () => ({ me: me.hp, foe: foe.hp });
  const c = { isFirst, orderOff, foe, pre: { me: me.hp, foe: foe.hp }, live, ...x };
  const flags = { ignoreRes: !!hasOp(sk, 'ignoreRes') };
  // 技の威力：「次のターンの威力加算」と「このターンの威力追加」は技本体だけに乗る（追加攻撃は別の攻撃なので乗らない）
  let power = sk.power + (x.copied ? 0 : (me.cur.powBonus || 0));   // コピーした技には、自分の「次のターンの威力加算」は乗らない
  for (const o of ops(sk)) if (o.op === 'bonus' && condOk(o.cond, c)) power += o.power;
  if (!x.copied) for (const e of (me.cur.powBonusEl || [])) if (e.el === sk.el) power += e.n;      // 次の攻撃が指定属性なら加算
  const hits = [{ type: sk.type, power, main: true }];
  for (const o of ops(sk)) if (o.op === 'extra') {
    if (o.cond && o.cond.startsWith('after')) hits.push({ type: o.type, power: o.power, stat: o.stat, lazy: o.cond }); // 攻撃後に判定
    else if (condOk(o.cond, c)) hits.push({ type: o.type, power: o.power, stat: o.stat });
  }
  if (x.nulled) { // 打ち消された技：「打消しが発生した場合」の追加攻撃だけが通る
    hits.length = 0;
    for (const o of ops(sk)) if (o.op === 'extra' && o.cond === 'clash') hits.push({ type: o.type, power: o.power, stat: o.stat });
  } else if (!x.copied && me.cur.powMult) hits[0].power *= me.cur.powMult; // 「次のターンの技の威力を倍」：技本体のみ
  let total = 0, mainTotal = 0;
  const factor = Math.pow(0.5, foe.cur.halfN || 0) * Math.pow(2, foe.cur.doubleN || 0); // 半減は重ねがけ（半分×半分＝4分の1）
  const dealt = (h, d) => {
    if (factor !== 1) d = Math.max(C.MIN_DMG, Math.round(d * factor));
    if (me.cur.guts > 1) d = Math.round(d * me.cur.guts);
    if (C.CRIT_CHANCE && x.rng && x.rng.chance(C.CRIT_CHANCE)) d = Math.round(d * C.CRIT_MULT);
    if (C.DMG_CAP_RATIO) d = Math.min(d, Math.max(C.MIN_DMG, Math.round(foe.maxHp * C.DMG_CAP_RATIO)));
    if (C.MIN_DMG_RATIO) d = Math.max(d, Math.round(foe.maxHp * C.MIN_DMG_RATIO));
    const wasFull = foe.hp === foe.maxHp;
    foe.hp = Math.max(0, foe.hp - d); total += d; if (h.main) mainTotal += d; foe.takenThis += d;
    if (foe.hp <= 0 && C.ENDURE_FULL_HP && wasFull && !foe.endured) { foe.hp = 1; foe.endured = true; }
    ev.push({ t: 'hit', who, skill: sk.name, dmg: d, foeHp: foe.hp, extra: !h.main && !h.copy, copy: !!x.copied, type: h.type, el: h.el || sk.el });
  };
  for (const h of hits) {
    if (foe.hp <= 0) break;
    if (h.lazy && !condOk(h.lazy, c)) continue;
    dealt(h, calcDamage(me, { el: h.el || sk.el, type: h.type, power: h.power }, foe, turn, { ...flags, stat: h.stat }));
  }
  if (x.nulled) return;
  // 画面のログ・HPバー用に、HPが変わる効果は量つきのイベントを出す
  const heal = n => { const b = me.hp; me.hp = Math.min(me.maxHp, me.hp + n); if (me.hp > b) ev.push({ t: 'heal', who, n: me.hp - b, hp: me.hp }); };
  const hurt = (n, cause) => { const d = Math.max(0, Math.min(n, me.hp)); me.hp -= n; if (d > 0) ev.push({ t: 'selfDamage', who, n: d, hp: Math.max(0, me.hp), cause }); if (me.hp <= 0) me.selfKO = true; };
  const setHp = (target, who2, cause) => { if (target.hp > 0) { target.hp = 0; if (target === me) me.selfKO = true; ev.push({ t: 'hpSet', target: who2, hp: 0, cause }); } };
  const base = o => (o.excludeExtras ? mainTotal : total);   // 回復・反動の計算に、追加攻撃のダメージを含めるか
  for (const o of ops(sk)) {
    if (o.cond && !condOk(o.cond, c)) continue;
    switch (o.op) {
      case 'drain': heal(Math.round(base(o) * o.ratio)); break;
      case 'recoil': hurt(Math.round(base(o) * o.ratio), 'recoil'); break;
      case 'selfDamage': hurt(o.n, 'selfDamage'); break;
      case 'selfAttack': hurt(calcDamage(me, { el: sk.el, type: o.type || sk.type, power: o.power }, me, turn), 'selfAttack'); break;
      case 'selfKO': setHp(me, who, 'selfKO'); break;
      case 'heal': heal(o.n === 'full' ? me.maxHp : o.n); break;
      case 'drainIfFoeLower': if (foe.hp < me.hp) heal(total); break;
      case 'duel': if (foe.hp < me.hp) setHp(foe, who === 'a' ? 'b' : 'a', 'duel'); else if (foe.hp > me.hp) setHp(me, who, 'duel'); break;
      case 'ohko': setHp(foe, who === 'a' ? 'b' : 'a', 'ohko'); break;
      case 'onKill': if (foe.hp <= 0) { heal(o.heal || 0); if (o.nextPower) me.pending.powBonus = (me.pending.powBonus || 0) + o.nextPower; } break;
      case 'counterOnSelfKO': // 自分の効果（反動など）で倒れた場合の反撃。相手を倒したらHPが回復して生き残る
        if (me.hp <= 0 && me.selfKO && foe.hp > 0) {
          let d = calcDamage(me, { el: sk.el, type: o.type, power: o.power }, foe, turn, flags);
          if (factor !== 1) d = Math.max(C.MIN_DMG, Math.round(d * factor));
          foe.hp = Math.max(0, foe.hp - d); total += d; foe.takenThis += d;
          ev.push({ t: 'hit', who, skill: sk.name, dmg: d, foeHp: foe.hp, counter: true, type: o.type, el: sk.el });
          if (foe.hp <= 0 && o.healOnKill) { me.hp = o.healOnKill; me.selfKO = false; ev.push({ t: 'heal', who, n: o.healOnKill, hp: me.hp }); }
        }
        break;
      case 'nextFirst': me.pending.first = true; break;
      case 'nextPower': me.pending.powBonus = (me.pending.powBonus || 0) + o.n; break;
      case 'nextPowerEl': (me.pending.powBonusEl = me.pending.powBonusEl || []).push({ el: o.el, n: o.n }); break;
      case 'nextHalf': me.pending.halfN = (me.pending.halfN || 0) + 1; break;
      case 'nextDouble': me.pending.doubleN = (me.pending.doubleN || 0) + 1; break;
      case 'stun': if (foe.hp > 0) foe.stunTurn = turn + 1; break;
      case 'selfStun': if (foe.hp > 0) me.stunTurn = turn + 1; break; // 相手を倒した場合は行動不能にならない
      case 'halfNow': me.cur.halfN = (me.cur.halfN || 0) + 1; break; // このターン、相手から受けるダメージを半減
      case 'nextPowerDouble': me.pending.powMult = 2; break;
      case 'stat': { const tgt = o.target === 'self' ? me : foe;
        if (tgt.hp > 0) tgt.mods.push({ stat: o.stat, mult: o.mult, add: o.add, from: turn + 1, until: o.duration === 'perm' ? Infinity : turn + 1 }); break; }
    }
  }
  me.hp = Math.max(0, me.hp); foe.hp = Math.max(0, foe.hp);
  if (ops(sk).length) ev.push({ t: 'effect', who, ops: ops(sk).map(o => o.op) });
  // 相手の攻撃をコピー（copyFoe）：無効化した相手の技を、そのまま追加で使う。
  //   威力・属性・種別・追加攻撃・反動・回復・追加効果もふくめて、自分が使ったものとして行う（反動は自分が受ける）。
  //   ただし、先制・後攻・無効化・コピーの効果は、写さない（終わらなくなるため）
  const cp = !x.copied && !x.nulled && x.foeSk ? ops(sk).find(o => o.op === 'copyFoe' && condOk(o.cond, c)) : null;
  if (cp && me.hp > 0 && foe.hp > 0) {
    const META = new Set(['forceFirst', 'forceLast', 'nullifyFoe', 'copyFoe']);
    const csk = { ...x.foeSk, effects: ops(x.foeSk).filter(o => !META.has(o.op)) };
    perform(me, foe, csk, isFirst, turn, ev, who, orderOff, { rng: x.rng, copied: true, clash: x.clash, foeNullified: x.foeNullified });
  }
}
// 1ターンを処理。slotA/slotB は技の枠(0〜2)。行動不能なら null
export function resolveTurn(st, slotA, slotB, rng) {
  const { a, b, turn } = st; const ev = [];
  for (const f of [a, b]) { f.selfKO = false; f.cur = f.pending; f.pending = {}; f.cur.guts = C.GUTS_K ? 1 + C.GUTS_K * Math.min(1, f.takenLast / f.maxHp) : 1; }
  const actA = a.stunTurn !== turn && slotA != null;
  const actB = b.stunTurn !== turn && slotB != null;
  const sa = actA ? a.profile.slots[slotA] : null, sb = actB ? b.profile.slots[slotB] : null;
  ev.push({ t: 'turn', turn, rage: rageMult(turn), warn: turn >= C.WARN_TURN });
  if (!actA) ev.push({ t: 'stunned', who: 'a' });
  if (!actB) ev.push({ t: 'stunned', who: 'b' });
  // 行動順：技による先制/後攻 → 前ターンの「先制できる」 → SPD → ランダム
  const prio = (f, sk) => hasOp(sk, 'forceFirst') ? 2 : hasOp(sk, 'forceLast') ? -1 : f.cur.first ? 1 : 0;
  const pA = prio(a, sa), pB = prio(b, sb);
  const sA = effStat(a, 'spd', turn), sB = effStat(b, 'spd', turn);
  const aFirst = pA !== pB ? pA > pB : (sA === sB ? rng.chance(0.5) : sA > sB);
  // 下剋上：相手の技に有利な属性の技なら相手の技を無効化（光⇔闇は相殺）＋技自体の無効化効果
  let nullA = actA && actB && beats(sb.el, sa.el), nullB = actA && actB && beats(sa.el, sb.el);
  const orderOff = C.CLASH_CANCELS_ORDER_EFFECTS && (nullA || nullB); // 属性の打ち消し発生ターン
  const nf = (sk, isFirst, foeSk) => { const o = hasOp(sk, 'nullifyFoe'); return !!o && condOk(o.cond, { isFirst, orderOff }) && (!o.foeType || o.foeType === foeSk.type); };
  // 属性による打ち消しが最優先。属性で勝敗が決まるターンは、技の効果による無効化（先制なら相手の攻撃を無効、など）は働かない
  if (actA && actB && !nullA && !nullB) { if (nf(sa, aFirst, sb)) nullB = true; if (nf(sb, !aFirst, sa)) nullA = true; }
  const anyClash = nullA || nullB;
  if (anyClash) ev.push({ t: 'clash', a: nullA, b: nullB });
  const order = aFirst ? ['a', 'b'] : ['b', 'a'];
  order.forEach((w, idx) => {
    const me = st[w], foe = st[w === 'a' ? 'b' : 'a'];
    const acts = w === 'a' ? actA : actB, nulled = w === 'a' ? nullA : nullB;
    const sk = w === 'a' ? sa : sb;
    if (!acts || me.hp <= 0 || foe.hp <= 0) return;
    const x = { rng, nulled, foeNullified: w === 'a' ? nullB : nullA, clash: anyClash, foeSk: w === 'a' ? sb : sa };
    if (nulled) ev.push({ t: 'nullified', who: w, skill: sk.name });
    perform(me, foe, sk, idx === 0, turn, ev, w, orderOff, x);
  });
  a.prevSlot = actA ? slotA : null; b.prevSlot = actB ? slotB : null;
  for (const f of [a, b]) { f.takenLast = f.takenThis; f.takenThis = 0; }
  if (a.hp <= 0 || b.hp <= 0) {
    st.over = true;
    if (a.hp <= 0 && b.hp <= 0) { // 同時に倒れた：原則は相打ち。ただし反動など自分の効果で倒れた側がいれば、その側の負け
      if (a.selfKO && !b.selfKO) { st.result = 'b'; b.hp = 1; ev.push({ t: 'judgeWin', who: 'b', reason: 'selfKO' }); }
      else if (b.selfKO && !a.selfKO) { st.result = 'a'; a.hp = 1; ev.push({ t: 'judgeWin', who: 'a', reason: 'selfKO' }); }
      else st.result = 'draw';
    } else st.result = b.hp <= 0 ? 'a' : 'b';
    for (const w of ['a', 'b']) if (st[w].hp <= 0) ev.push({ t: 'faint', who: w });
  } else if (turn >= C.MAX_TURNS) { // 相打ち：両者戦闘不能
    a.hp = 0; b.hp = 0; st.over = true; st.result = 'draw'; ev.push({ t: 'mutualKO' });
  } else st.turn++;
  st.log.push(...ev);
  return ev;
}
// CPU同士で最後まで（クイックバトル／検証用）
export function simulate(profileA, profileB, rng) {
  const st = newBattle(createFighter(profileA), createFighter(profileB));
  while (!st.over) resolveTurn(st, aiChoose(st.a, st.turn, rng), aiChoose(st.b, st.turn, rng), rng);
  return st;
}
