// CPUの思考。コアは変更せず、画面側で「どの技を選ぶか」だけを差し替える。
// level 1 ランダム（コアと同じ） / 2 威力が高い技を多めに / 3 ダメージを予測して選ぶ / 4 3に加えて、HPが減ると回復も考える
// tower.json の各ステージに "ai": 1〜4 を書くと、そのステージのCPUの強さが変わる（なければ1）。
import { allowedSlots, calcDamage } from '../core/battle.js';

export const AI_LABELS = ['ランダム', '威力重視', 'ダメージ予測', '慎重'];
const hasOp = (s, name) => !!(s.effects && s.effects.some(o => o.op === name));

export function chooseSlot(f, foe, turn, rng, level = 1) {
  const ok = allowedSlots(f, turn);
  if (!ok.length) return null;
  const slots = f.profile.slots;
  if (level <= 1) return rng.pick(ok);
  if (level === 2) {
    const w = ok.map(i => slots[i].power), tot = w.reduce((a, b) => a + b, 0);
    let r = rng.next() * tot;
    for (let k = 0; k < ok.length; k++) { r -= w[k]; if (r <= 0) return ok[k]; }
    return ok[ok.length - 1];
  }
  if (level >= 4 && f.hp < f.maxHp * 0.4) {
    const heals = ok.filter(i => hasOp(slots[i], 'heal'));
    if (heals.length && rng.chance(0.7)) return rng.pick(heals);
  }
  if (rng.chance(0.2)) return rng.pick(ok); // たまに読みを外す
  const score = i => {
    const sk = slots[i];
    try { return calcDamage(f, { el: sk.el, type: sk.type, power: sk.power }, foe, turn, { ignoreRes: hasOp(sk, 'ignoreRes') }); }
    catch (e) { return sk.power; }
  };
  return ok.map(i => [i, score(i)]).sort((a, b) => b[1] - a[1])[0][0];
}
