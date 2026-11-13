// 通信の入口。どの方式でも、同じ形で使えるようにしてある（あとから差し替えられる）。
//   trystero … 本番。公開の中継所（Nostr）で相手を見つけて、そのあとは端末どうしが直接つながる（サーバーは要らない）
//   local    … 同じブラウザの2つのタブどうし（テスト用。アドレスの末尾に ?net=local）
// 戻り値の形：{ selfId, send(obj, target?), onMessage(fn), onPeerJoin(fn), onPeerLeave(fn), peers(), leave() }
//   fn の引数：onMessage(data, peerId) / onPeerJoin(peerId) / onPeerLeave(peerId)

// 使う版は、ここで1か所だけ決める（公開から2週間以上たった版を選ぶこと）
export const TRYSTERO_URL = 'https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm';
export const APP_ID = 'barcode-summoner-pvp-v1';
// モバイル回線どうしは、直接つながらないことが多い。そのとき、この中継サーバー（TURN）を通す。
// Metered の Open Relay（無料枠あり。使った量は、Metered の管理画面で見られる）。
// この情報は公開のコードに入る。使われすぎたら、管理画面で「Remove」して、新しく作り直し、ここを差し替える。
// 同じ場所の直接つながる対戦は、中継を通らないので、枠を使わない。
const TURN_USER = '3ff89d2f41882597c04644f3', TURN_PASS = '/zMaoSryNBT0OAbJ';
export const TURN_CONFIG = [
  { urls: 'turn:global.relay.metered.ca:80', username: TURN_USER, credential: TURN_PASS },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: TURN_USER, credential: TURN_PASS },
  { urls: 'turn:global.relay.metered.ca:443', username: TURN_USER, credential: TURN_PASS },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: TURN_USER, credential: TURN_PASS },   // 443番のTLS：厳しい回線でも通りやすい
];   // 使わないとき（直接つなぐだけ）は null にする

export const netKind = () => {
  try { return new URLSearchParams(location.search).get('net') === 'local' ? 'local' : 'trystero'; } catch (e) { return 'trystero'; }
};

function makeHub() {
  const hub = { peers: new Set(), handlers: { msg: null, join: null, leave: null } };
  hub.onMessage = fn => { hub.handlers.msg = fn; };
  hub.onPeerJoin = fn => { hub.handlers.join = fn; for (const p of hub.peers) fn(p); };   // 先に来ていた相手も知らせる
  hub.onPeerLeave = fn => { hub.handlers.leave = fn; };
  hub.peerJoined = id => { if (hub.peers.has(id)) return; hub.peers.add(id); if (hub.handlers.join) hub.handlers.join(id); };
  hub.peerLeft = id => { if (!hub.peers.delete(id)) return; if (hub.handlers.leave) hub.handlers.leave(id); };
  hub.peerList = () => [...hub.peers];
  return hub;
}

export async function openRoom(roomId, { kind = netKind(), onJoinError } = {}) {
  return kind === 'local' ? openLocal(roomId) : openTrystero(roomId, onJoinError);
}

async function openTrystero(roomId, onJoinError) {
  const { joinRoom, selfId } = await import(/* @vite-ignore */ TRYSTERO_URL);
  const hub = makeHub();
  const cfg = { appId: APP_ID };
  if (TURN_CONFIG) cfg.turnConfig = TURN_CONFIG;
  const room = joinRoom(cfg, roomId, { onJoinError: d => { if (onJoinError) onJoinError(d); } });
  const act = room.makeAction('bs');
  act.onMessage = (data, { peerId }) => { if (hub.handlers.msg) hub.handlers.msg(data, peerId); };
  room.onPeerJoin = id => hub.peerJoined(id);
  room.onPeerLeave = id => hub.peerLeft(id);
  return {
    selfId,
    send: (obj, target) => act.send(obj, target ? { target } : undefined),
    onMessage: hub.onMessage, onPeerJoin: hub.onPeerJoin, onPeerLeave: hub.onPeerLeave,
    peers: hub.peerList,
    leave: () => { try { room.leave(); } catch (e) { /* 何もしない */ } },
  };
}

// 同じブラウザのタブどうし（BroadcastChannel）。テスト用。
function openLocal(roomId) {
  const id = 'L' + Math.random().toString(36).slice(2, 10);
  const ch = new BroadcastChannel('bs-local-' + roomId);
  const hub = makeHub();
  ch.onmessage = ev => {
    const m = ev.data;
    if (!m || m.from === id || (m.to && m.to !== id)) return;
    if (m.k === 'hi') { hub.peerJoined(m.from); if (!m.re) ch.postMessage({ k: 'hi', from: id, to: m.from, re: 1 }); }
    else if (m.k === 'bye') hub.peerLeft(m.from);
    else if (m.k === 'msg') { hub.peerJoined(m.from); if (hub.handlers.msg) hub.handlers.msg(m.data, m.from); }
  };
  ch.postMessage({ k: 'hi', from: id });
  const leave = () => { try { ch.postMessage({ k: 'bye', from: id }); ch.close(); } catch (e) { /* 何もしない */ } };
  try { window.addEventListener('pagehide', leave); } catch (e) { /* node */ }
  return Promise.resolve({
    selfId: id,
    send: (obj, target) => ch.postMessage({ k: 'msg', from: id, to: target || null, data: JSON.parse(JSON.stringify(obj)) }),
    onMessage: hub.onMessage, onPeerJoin: hub.onPeerJoin, onPeerLeave: hub.onPeerLeave,
    peers: hub.peerList, leave,
  });
}

// テスト用：メモリの中で、2つの端をつなぐ（通信の仕組みを、ネットワークなしで確かめる）
export function memoryPair() {
  const mk = id => { const hub = makeHub(); return { id, hub, other: null, up: true }; };
  const A = mk('A'), B = mk('B');
  A.other = B; B.other = A;
  const api = n => ({
    selfId: n.id,
    send: (obj) => { const o = n.other; if (!n.up || !o.up) return; const data = JSON.parse(JSON.stringify(obj)); queueMicrotask(() => { if (o.up && n.up && o.hub.handlers.msg) o.hub.handlers.msg(data, n.id); }); },
    onMessage: n.hub.onMessage, onPeerJoin: n.hub.onPeerJoin, onPeerLeave: n.hub.onPeerLeave,
    peers: n.hub.peerList, leave: () => { n.up = false; n.other.hub.peerLeft(n.id); },
  });
  const a = api(A), b = api(B);
  return {
    a, b,
    connect: () => { A.up = B.up = true; A.hub.peerJoined('B'); B.hub.peerJoined('A'); },
    drop: () => { A.up = B.up = false; A.hub.peerLeft('B'); B.hub.peerLeft('A'); },   // 回線が切れた
  };
}
