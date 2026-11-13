// 物語（チュートリアルの幕）：立ち絵・メッセージ欄・文字送り
//   立ち絵は、左（L）と右（R）に、最大2人。しゃべっている人は明るく、もう1人は暗く出る。
//   ボク（主人公）は、立ち絵なしで、メッセージ欄だけ（ひとりごと）。位置は、data/story.json の cast[名前].side（L／R／null）
//   タップ（または、メッセージ欄を押す）で、文字を最後まで出す→次へ。「スキップ」で、幕の終わりへ
//   オート：文字が出そろってから、少し待って、自動で次へ（待ち時間は、オプションの「オートの速さ」）。声が鳴っているときは、鳴り終わるまで待つ。
//           最後の1行では止まる（いきなりバトルに入らない）。ログを開いている間・確認のダイアログの間は、止まる
//   ログ：ここまでの会話を、さかのぼって読む
//   音声：audio/voice/<音声ID>.mp3 があれば、セリフに合わせて鳴らす（なければ、鳴らさない）
import { h } from './dom.js';
import { confirmDialog } from './dialog.js';

const CHAR_MS = 32;   // 1文字が出る間隔（ミリ秒）

// オートの待ち時間（文字が出そろってから、次へ進むまで）＝ base ＋ 1文字あたり × 文字数
export const AUTO = { fast: { base: 500, per: 22 }, normal: { base: 900, per: 42 }, slow: { base: 1500, per: 70 } };
export const autoWaitMs = (len, speed = 'normal') => { const a = AUTO[speed] || AUTO.normal; return Math.round(a.base + a.per * Math.max(0, len)); };
const VOICE_GAP = 600;   // 声が鳴り終わってから、次へ進むまで

export function story(root, ctx, params = {}) {
  const S = ctx.data.story, act = S.acts.find(a => a.id === params.act);
  if (!act) { ctx.go('tutorial'); return; }
  let i = 0, typing = false, timer = 0, voice = null, alive = true;
  let autoOn = !!ctx.store.get().options.storyAuto, autoTimer = 0, paused = false, voiceBusy = false;
  const log = [];   // 見た行のログ { name, side, text }
  const shown = { L: null, R: null };   // それぞれの側に出ている立ち絵 { who, img }

  const wrap = h('div', 'page story');
  const bar = h('header', 'bar');
  const back = h('button', 'btn small', '戻る'), skip = h('button', 'btn small', 'スキップ');
  const logBtn = h('button', 'btn small', 'ログ'), autoBtn = h('button', 'btn small st-auto', 'オート');
  const prog = h('span', 'st-prog', '');
  bar.append(back, h('h1', '', act.title), prog);
  const tools = h('div', 'st-tools');   // 画面が狭くても収まるように、タイトルの行とは分ける
  tools.append(logBtn, autoBtn, skip);
  const stage = h('div', 'st-stage');
  const sp = { L: h('div', 'st-sp L'), R: h('div', 'st-sp R') };
  stage.append(sp.L, sp.R);
  const winWrap = h('div', 'st-winwrap'), win = h('div', 'panel st-win');   // 名前の札は、枠の外に出すので、枠（panel）の外に置く
  const name = h('div', 'st-name'), text = h('div', 'st-text'), next = h('span', 'st-next', '▼');
  win.append(text, next); winWrap.append(name, win);
  wrap.append(bar, tools, stage, winWrap);
  root.append(wrap);

  // 会話が終わったら、幕の最後のバトルへ（なければ、幕を見終わったことにして、一覧へ）。バトルの勝ち負けで、物語は分かれない
  const finish = () => {
    const b = act.battle;
    if (b) return ctx.go('match', { kind: 'tutorial', act: act.id, mineJans: b.mine, foeJans: b.foe, ai: b.ai || 1, labels: b.labels, intro: true });
    ctx.store.update(s => { if (!s.tutorial.done.includes(act.id)) s.tutorial.done.push(act.id); });
    ctx.go('tutorial');
  };
  // 確認のダイアログの間は、オートを止める
  const ask = async (text, yes, no) => { paused = true; clearTimeout(autoTimer); const r = await confirmDialog(text, yes, no); paused = false; if (!r) scheduleAuto(); return r; };
  back.onclick = async () => { if (await ask('物語を中断して、戻りますか？', '中断して戻る', '続ける')) ctx.go('tutorial'); };
  skip.onclick = async () => { if (await ask(act.battle ? '会話を飛ばして、バトルへ進みますか？' : 'この幕を、最後まで飛ばしますか？', '飛ばす', '続ける')) finish(); };

  // オート
  const speed = () => ctx.store.get().options.autoSpeed || 'normal';
  const paintAuto = () => { autoBtn.classList.toggle('on', autoOn); autoBtn.setAttribute('aria-pressed', String(autoOn)); autoBtn.textContent = autoOn ? 'オート中' : 'オート'; };
  function scheduleAuto(ms) {
    clearTimeout(autoTimer);
    if (!autoOn || !alive || typing || paused) return;
    if (i + 1 >= act.lines.length) return;   // 最後の1行は、タップを待つ
    if (voiceBusy && ms == null) return;     // 声が鳴っている間は、鳴り終わりで進む
    const l = act.lines[i], wait = ms != null ? ms : autoWaitMs((l.text || l.note || '').length, speed());
    autoTimer = setTimeout(() => { if (document.hidden || paused) return scheduleAuto(); advance(); }, wait);
  }
  autoBtn.onclick = () => {
    autoOn = !autoOn; paintAuto();
    ctx.store.update(s => { s.options.storyAuto = autoOn; });
    if (autoOn) scheduleAuto(); else clearTimeout(autoTimer);
  };
  paintAuto();

  // ログ（ここまでの会話。端末の「戻る」でも閉じられる）
  logBtn.onclick = () => {
    paused = true; clearTimeout(autoTimer);
    const layer = document.getElementById('dialog'), back2 = h('div', 'dlg-back'), box = h('div', 'dlg panel st-log');
    box.setAttribute('role', 'dialog');
    const list = h('div', 'st-log-list');
    log.slice(0, i + 1).forEach((e, k) => {
      if (!e) return;
      const it = h('div', 'st-log-item' + (k === i ? ' now' : ''));
      if (e.name) it.append(h('div', 'st-log-name side' + (e.side || 'N'), e.name));
      it.append(h('div', 'st-log-text', e.text));
      list.append(it);
    });
    const close = h('button', 'btn primary', '閉じる'); close.dataset.back = '1';
    close.onclick = () => { back2.remove(); paused = false; scheduleAuto(); };
    box.append(h('h2', 'dlg-title', '会話のログ'), list, h('div', 'dlg-btns').appendChild(close).parentNode);
    back2.append(box); layer.append(back2);
    list.scrollTop = list.scrollHeight; setTimeout(() => close.focus(), 0);
  };

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
    voiceBusy = false;
    if (!id) return;
    try {
      const a = new Audio(`audio/voice/${id}.mp3`); a.volume = Math.max(0, Math.min(1, (ctx.store.get().options.se || 0) / 100));
      voice = a;
      a.onplaying = () => { if (voice !== a) return; voiceBusy = true; clearTimeout(autoTimer); };   // 鳴り始めたら、オートは声の終わりまで待つ
      a.onended = () => { if (voice !== a) return; voiceBusy = false; if (!typing) scheduleAuto(VOICE_GAP); };
      a.onerror = () => { if (voice !== a) return; voiceBusy = false; };
      a.play().catch(() => { if (voice === a) voiceBusy = false; });   // ファイルがない・自動再生できない、は、声なしの待ち時間で進む
    } catch (e) { voiceBusy = false; }
  }

  function show() {
    const l = act.lines[i], c = S.cast[l.who] || { display: l.who || '', side: null };
    clearInterval(timer); clearTimeout(autoTimer);
    if (c.side) setSprite(c.side, l.who, l.img);
    ['L', 'R'].forEach(s => sp[s].classList.toggle('dim', !c.side || c.side !== s));   // しゃべっていない側は、暗く
    name.textContent = l.who ? c.display : '';
    name.className = 'st-name ' + (c.side === 'L' ? 'sideL' : c.side === 'R' ? 'sideR' : 'sideN');
    win.classList.toggle('solo', !c.side);   // ひとりごと
    prog.textContent = `${i + 1}/${act.lines.length}`;
    const body = l.text || l.note || '';
    log[i] = { name: l.who ? c.display : '', side: c.side, text: body };
    text.textContent = ''; next.style.visibility = 'hidden'; typing = true;
    let k = 0;
    timer = setInterval(() => { text.textContent = body.slice(0, ++k); if (k >= body.length) done(); }, CHAR_MS);
    if (!body) done();
    playVoice(l.voice);
  }
  function done() { clearInterval(timer); typing = false; next.style.visibility = 'visible'; const l = act.lines[i]; text.textContent = l.text || l.note || ''; scheduleAuto(); }
  function advance() {
    if (!alive) return;
    if (typing) return done();
    if (i + 1 >= act.lines.length) return finish();
    i++; show();
  }
  const tap = e => { if (e.target.closest('.bar') || e.target.closest('.st-tools')) return; advance(); };
  wrap.addEventListener('click', tap);
  show();
  return () => { alive = false; clearInterval(timer); clearTimeout(autoTimer); if (voice) { try { voice.pause(); } catch (e) { /* 何もしない */ } } };
}
