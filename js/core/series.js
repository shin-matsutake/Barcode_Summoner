// 勝ち抜き戦（1v1の連戦）の進行管理。
// ルール：
//  - 勝った個体は残り、HPは持ち越す（回復なし）。負けた側は次の個体が全回復で登場する
//  - 相打ち（同時に倒れる／10ターンで決着なし）は両者退場。反動などで同時に倒れて判定勝ちになった場合も両者退場（勝者はHP1で残るが交代する）
//  - 戦闘ごとにターン数・レイジ・「前のターンに使った枠」はリセットする
//  - 威力アップなどの効果はリセットしない：倒れるまで続く能力変化と、最後のターンに付いた「次のターン効果」は
//    次の戦闘の1ターン目に持ち越す。行動不能（反動の拘束など）は持ち越さない
import { createFighter, newBattle, resolveTurn, aiChoose } from './battle.js';

// 勝者を次の戦闘へ引き継ぐ。lastTurn は終わった戦闘の最終ターン番号
export function carryOver(f, lastTurn) {
  f.mods = f.mods
    .filter(m => m.until === Infinity || (m.from === lastTurn + 1 && m.until === lastTurn + 1))
    .map(m => (m.until === Infinity ? { ...m, from: 1 } : { ...m, from: 1, until: 1 }));
  f.cur = {};           // pending（次のターン効果）は、そのまま次の戦闘の1ターン目に効く
  f.prevSlot = null;    // 前のターンの使用枠の制限はリセット
  f.stunTurn = -1;      // 行動不能は持ち越さない
  f.takenThis = 0; f.takenLast = 0;
}

export function startSeries(profilesA, profilesB) {
  if (!profilesA.length || !profilesB.length) throw new Error('チームが空です');
  const fighters = { a: createFighter(profilesA[0]), b: createFighter(profilesB[0]) };
  const s = { teams: { a: profilesA, b: profilesB }, idx: { a: 0, b: 0 }, fighters, battleNo: 1,
              battle: newBattle(fighters.a, fighters.b), over: false, result: null, log: [] };
  s.log.push({ t: 'enter', who: 'a', name: fighters.a.name, no: 1 }, { t: 'enter', who: 'b', name: fighters.b.name, no: 1 });
  return s;
}

// 1ターン進める。戦闘が終わったら、次の個体の登場や試合の終了まで処理する。発生したイベントを返す
export function resolveSeriesTurn(s, slotA, slotB, rng) {
  if (s.over) throw new Error('試合は終了しています');
  const out = [...resolveTurn(s.battle, slotA, slotB, rng)];
  if (s.battle.over) {
    const r = s.battle.result, lastTurn = s.battle.turn;
    out.push({ t: 'battleEnd', result: r, no: s.battleNo });
    const judged = out.find(e => e.t === 'judgeWin');  // 同時に倒れ、自分の効果で倒れた側の負けと判定された
    const fainted = judged ? { a: true, b: true } : { a: r !== 'a', b: r !== 'b' };   // 相打ち（draw）・判定勝ちは両方退場
    for (const w of ['a', 'b']) if (fainted[w]) s.idx[w]++;
    const remain = { a: s.idx.a < s.teams.a.length, b: s.idx.b < s.teams.b.length };
    if (!remain.a || !remain.b) {
      s.over = true; s.result = !remain.a && !remain.b ? (judged ? judged.who : 'draw') : (remain.a ? 'a' : 'b'); // 最後の1体どうしの判定勝ちは、判定勝ちの側が試合の勝ち
      out.push({ t: 'matchEnd', result: s.result });
    } else {
      s.battleNo++;
      for (const w of ['a', 'b']) {
        if (fainted[w]) { s.fighters[w] = createFighter(s.teams[w][s.idx[w]]); out.push({ t: 'enter', who: w, name: s.fighters[w].name, no: s.battleNo }); }
        else carryOver(s.fighters[w], lastTurn);
      }
      s.battle = newBattle(s.fighters.a, s.fighters.b);
    }
  }
  s.log.push(...out);
  return out;
}

// CPU同士で最後まで（検証用）
export function simulateSeries(profilesA, profilesB, rng) {
  const s = startSeries(profilesA, profilesB);
  while (!s.over) {
    const t = s.battle.turn;
    resolveSeriesTurn(s, aiChoose(s.battle.a, t, rng), aiChoose(s.battle.b, t, rng), rng);
  }
  return s;
}
