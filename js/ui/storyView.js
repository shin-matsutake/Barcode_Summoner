// 物語（チュートリアルの幕）：立ち絵・メッセージ欄・文字送り
//   立ち絵は、左（L）と右（R）に、最大2人。しゃべっている人は明るく、もう1人は暗く出る。
//   ボク（主人公）は、立ち絵なしで、メッセージ欄だけ（ひとりごと）。位置は、data/story.json の cast[名前].side（L／R／null）
//   タップ（または、メッセージ欄を押す）で、文字を最後まで出す→次へ。「スキップ」で、幕の終わりへ
//   音声：audio/voice/<音声ID>.mp3 があれば、セリフに合わせて鳴らす（なければ、鳴らさない）
import { h } from './dom.js';
import { confirmDialog } from './dialog.js';

const CHAR_MS = 32;   // 1文字が出る間隔（ミリ秒）

export function story(root, ctx, params = {}) {
  const S = ctx.data.story, act = S.acts.find(a => a.id === params.act);
  if (!act) { ctx.go('tutorial'); return; }
  let i = 0, typing = false, timer = 0, voice = null, alive = true;
  const shown = { L: null, R: null };   // それぞれの側に出ている立ち絵 { who, img }

  const wrap = h('div', 'page story');
  const bar = h('header', 'bar');
  const back = h('button', 'btn small', '戻る'), skip = h('button', 'btn small', 'スキップ');
  const prog = h('span', 'st-prog', '');
  bar.append(back, h('h1', '', act.title), prog, skip);
  const stage = h('div', 'st-stage');
  const sp = { L: h('div', 'st-sp L'), R: h('div', 'st-sp R') };
  stage.append(sp.L, sp.R);
  const winWrap = h('div', 'st-winwrap'), win = h('div', 'panel st-win');   // 名前の札は、枠の外に出すので、枠（panel）の外に置く
  const name = h('div', 'st-name'), text = h('div', 'st-text'), next = h('span', 'st-next', '▼');
  win.append(text, next); winWrap.append(name, win);
  wrap.append(bar, stage, winWrap);
  root.append(wrap);

  const finish = () => {
    ctx.store.update(s => { if (!s.tutorial.done.includes(act.id)) s.tutorial.done.push(act.id); });
    ctx.go('tutorial');
  };
  back.onclick = async () => { if (await confirmDialog('物語を中断して、戻りますか？', '中断して戻る', '続ける')) ctx.go('tutorial'); };
  skip.onclick = async () => { if (await confirmDialog('この幕を、最後まで飛ばしますか？', '飛ばす', '続ける')) finish(); };

  function setSprite(side, who, img) {
    const el = sp[side];
    if (!who) { el.replaceChildren(); el.classList.remove('on'); shown[side] = null; return; }
    if (shown[side] && shown[side].who === who && shown[side].img === img) return;   // 同じ人は、そのまま
    shown[side] = { who, img };
    const im = new Image(); im.alt = who;
    const label = (S.cast[who] && S.cast[who].display) || who;
    im.onerror = () => { el.replaceChildren(h('div', 'st-ph', label)); };   // 立ち絵がないときは、名前の仮の札
    im.src = `images/story/${img || 'sample.png'}`;
    el.replaceChildren(im); el.classList.add('on');
  }

  function playVoice(id) {
    if (voice) { try { voice.pause(); } catch (e) { /* 何もしない */ } voice = null; }
    if (!id) return;
    try {
      const a = new Audio(`audio/voice/${id}.mp3`); a.volume = Math.max(0, Math.min(1, (ctx.store.get().options.se || 0) / 100));
      voice = a; a.play().catch(() => { /* ファイルがない・自動再生できない、は無視 */ });
    } catch (e) { /* 何もしない */ }
  }

  function show() {
    const l = act.lines[i], c = S.cast[l.who] || { display: l.who || '', side: null };
    clearInterval(timer);
    if (c.side) setSprite(c.side, l.who, l.img);
    ['L', 'R'].forEach(s => sp[s].classList.toggle('dim', !c.side || c.side !== s));   // しゃべっていない側は、暗く
    name.textContent = l.who ? c.display : '';
    name.className = 'st-name ' + (c.side === 'L' ? 'sideL' : c.side === 'R' ? 'sideR' : 'sideN');
    win.classList.toggle('solo', !c.side);   // ひとりごと
    prog.textContent = `${i + 1}/${act.lines.length}`;
    const body = l.text || l.note || '';
    text.textContent = ''; next.style.visibility = 'hidden'; typing = true;
    let k = 0;
    timer = setInterval(() => { text.textContent = body.slice(0, ++k); if (k >= body.length) done(); }, CHAR_MS);
    if (!body) done();
    playVoice(l.voice);
  }
  function done() { clearInterval(timer); typing = false; next.style.visibility = 'visible'; const l = act.lines[i]; text.textContent = l.text || l.note || ''; }
  function advance() {
    if (!alive) return;
    if (typing) return done();
    if (i + 1 >= act.lines.length) return finish();
    i++; show();
  }
  const tap = e => { if (e.target.closest('.bar')) return; advance(); };
  wrap.addEventListener('click', tap);
  show();
  return () => { alive = false; clearInterval(timer); if (voice) { try { voice.pause(); } catch (e) { /* 何もしない */ } } };
}
