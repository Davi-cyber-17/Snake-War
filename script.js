'use strict';
/* ===== Snake War — HTML/CSS/JS puro. Online via WebRTC (PeerJS): o anfitrião da sala roda o jogo. ===== */
const $ = i => document.getElementById(i), cv = $('c'), ctx = cv.getContext('2d');
const COL = ['#ff9f1c', '#2cff8f', '#18e6ff', '#ff3b6b', '#b36bff', '#fff04d', '#ff6ec7', '#4d7cff'];
const KEYS = [['ArrowLeft', 'ArrowRight', 'ArrowUp'], ['KeyA', 'KeyD', 'KeyW'], ['KeyJ', 'KeyL', 'KeyI'], ['KeyF', 'KeyH', 'KeyT']];
const SP = 7, TR = .075, DT = 1 / 60, MAXP = 8, CODEC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:global.stun.twilio.com:3478' }
  /* Para redes muito restritivas (4G/CGNAT) adicione aqui um servidor TURN: { urls: 'turn:...', username: '...', credential: '...' } */
] };
/* Posições da cobra viajam como texto compacto: cabeça absoluta + deltas (1 letra por eixo). */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DEC = new Int8Array(128); for (let i = 0; i < 64; i++) DEC[ALPHA.charCodeAt(i)] = i;
const rnd = (a, b) => a + Math.random() * (b - a);
const R = s => 6 + Math.min(9, Math.sqrt(s.len) * .7);
const nm = () => ($('name').value.trim() || 'Jogador').slice(0, 12);
const esc = t => String(t).replace(/[<>&"]/g, '');
const keys = {}, cam = { x: 0, y: 0, len: 10 }, myIn = { aim: null, boost: false }, mouse = { on: false, x: 0, y: 0 };
let touch = matchMedia('(pointer:coarse)').matches, jo = null, bst = false, bid = null, DPR = 1, tf = null, vext = [900, 600];
let sim = null, view = null, mode = null, me = null, net = {}, down = false, tickN = 0, snapN = 0, frame = 0, last = 0, lastF = 0, acc = 0, ticker = null;

/* ---------- Simulação (local e anfitrião) ---------- */
class Sim {
  constructor(W, H) {
    this.W = W; this.H = H; this.sn = []; this.food = new Map(); this.fid = 1; this.nid = 0;
    this.net = false; this.log = []; this.logBase = 0; /* log de comida (criada/comida) enviado aos clientes */
    this.nf = Math.round(W * H / 8000);
    for (let i = 0; i < this.nf; i++) this.addFood();
  }
  addFood(x, y, v, c) {
    const f = [this.fid++, Math.round(x ?? rnd(20, this.W - 20)), Math.round(y ?? rnd(20, this.H - 20)), c ?? (Math.random() * 8 | 0), v ?? 1];
    this.food.set(f[0], f); if (this.net) this.log.push(f);
  }
  add(id, name, ctrl) {
    const ci = this.sn.length % 8;
    const s = { id, nid: this.nid++, name, ci, color: COL[ci], ctrl, input: { aim: null, boost: false, l: 0, r: 0 }, kills: 0, len: 10, alive: false, wait: 0, t: 0 };
    this.sn.push(s); this.spawn(s); return s;
  }
  spawn(s) {
    s.a = rnd(0, 6.28); s.len = 10; s.alive = true; s.seg = [];
    let x, y, ok, n = 0;
    do {
      x = rnd(250, this.W - 250); y = rnd(250, this.H - 250);
      ok = this.sn.every(o => o === s || !o.alive || o.seg.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 > 40000));
    } while (!ok && ++n < 20);
    for (let i = 0; i < 10; i++) s.seg.push({ x: x - Math.cos(s.a) * i * SP, y: y - Math.sin(s.a) * i * SP });
  }
  die(s) {
    s.alive = false; s.wait = 180; s.boost = false;
    for (let i = 0; i < s.seg.length; i += 2) this.addFood(s.seg[i].x + rnd(-6, 6), s.seg[i].y + rnd(-6, 6), 2, s.ci);
  }
  ai(s) {
    const h = s.seg[0];
    if (s.t % 4 === 0) {
      s.dng = false;
      const px = h.x + Math.cos(s.a) * 70, py = h.y + Math.sin(s.a) * 70;
      if (px < 60 || py < 60 || px > this.W - 60 || py > this.H - 60) s.dng = 'w';
      else for (const o of this.sn) {
        if (o === s || !o.alive) continue;
        if (o.seg.some(p => (p.x - px) ** 2 + (p.y - py) ** 2 < 1600)) { s.dng = true; break; }
      }
    }
    if (s.dng === 'w') s.input.aim = Math.atan2(this.H / 2 - h.y, this.W / 2 - h.x);
    else if (s.dng) { s.turn = s.turn || (Math.random() < .5 ? 1 : -1); s.input.aim = s.a + s.turn * 1.3; }
    else {
      s.turn = 0;
      if (s.t % 20 === 1) {
        let b = null, bd = 90000;
        for (const f of this.food.values()) { const d = (f[1] - h.x) ** 2 + (f[2] - h.y) ** 2; if (d < bd) { bd = d; b = f; } }
        s.goal = b ? Math.atan2(b[2] - h.y, b[1] - h.x) : s.a + rnd(-1, 1);
      }
      s.input.aim = s.goal;
    }
  }
  step() {
    for (const s of this.sn) {
      if (!s.alive) { if (--s.wait <= 0) this.spawn(s); continue; }
      s.t++;
      if (s.ctrl === 'bot') this.ai(s);
      const i = s.input;
      if (i.aim != null && !isNaN(i.aim)) { let d = i.aim - s.a; d = Math.atan2(Math.sin(d), Math.cos(d)); s.a += Math.max(-TR, Math.min(TR, d)); }
      else s.a += (i.r - i.l) * TR;
      s.boost = i.boost && s.len > 11;
      if (s.boost) {
        s.len -= .03;
        if (s.t % 20 === 0) { const t = s.seg[s.seg.length - 1]; this.addFood(t.x, t.y, 1, s.ci); }
      }
      const sp = s.boost ? 3.6 : 2.2, h = s.seg[0];
      h.x += Math.cos(s.a) * sp; h.y += Math.sin(s.a) * sp;
      for (let k = 1; k < s.seg.length; k++) {
        const p = s.seg[k - 1], q = s.seg[k], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > SP) { q.x = p.x + dx / d * SP; q.y = p.y + dy / d * SP; }
      }
      const n = Math.floor(s.len);
      while (s.seg.length < n) { const t = s.seg[s.seg.length - 1]; s.seg.push({ x: t.x, y: t.y }); }
      while (s.seg.length > n) s.seg.pop();
      if (h.x < 0 || h.y < 0 || h.x > this.W || h.y > this.H) { this.die(s); continue; }
      const er = R(s) + 6;
      for (const f of this.food.values())
        if ((f[1] - h.x) ** 2 + (f[2] - h.y) ** 2 < er * er) { s.len += f[4] * .5; this.food.delete(f[0]); if (this.net) this.log.push(f[0]); }
      const k = this.sn.find(o => o !== s && o.alive && o.seg.some(p => (p.x - h.x) ** 2 + (p.y - h.y) ** 2 < (R(s) + R(o) - 5) ** 2));
      if (k) { k.kills++; this.die(s); }
    }
    for (let i = 0; i < 3 && this.food.size < this.nf; i++) this.addFood();
  }
}

/* ---------- Codec de posições (anfitrião → clientes) ---------- */
/* Envia 1 ponto a cada 2 segmentos; o cliente recria os pontos do meio. */
function encodePts(seg) {
  let px = Math.round(seg[0].x), py = Math.round(seg[0].y), out = '';
  const hx = px, hy = py; let x0 = px, x1 = px, y0 = py, y1 = py;
  for (let i = 2; i < seg.length; i += 2) {
    const dx = Math.max(-32, Math.min(31, Math.round(seg[i].x) - px)), dy = Math.max(-32, Math.min(31, Math.round(seg[i].y) - py));
    out += ALPHA[dx + 32] + ALPHA[dy + 32]; px += dx; py += dy;
    if (px < x0) x0 = px; else if (px > x1) x1 = px;
    if (py < y0) y0 = py; else if (py > y1) y1 = py;
  }
  return { x: hx, y: hy, p: out, bb: [x0, y0, x1, y1] };
}
function decodePts(d) {
  const P = [{ x: d.x, y: d.y }]; let x = d.x, y = d.y; const p = d.p;
  for (let i = 0; i + 1 < p.length; i += 2) { x += DEC[p.charCodeAt(i) & 127] - 32; y += DEC[p.charCodeAt(i + 1) & 127] - 32; P.push({ x, y }); }
  const out = [];
  for (let i = 0; i < P.length; i++) { out.push(P[i]); if (i + 1 < P.length) out.push({ x: (P[i].x + P[i + 1].x) / 2, y: (P[i].y + P[i + 1].y) / 2 }); }
  return out;
}
function safeSend(c, m) { try { if (c && c.open) c.send(m); } catch (e) { } }

/* Snapshot por cliente: só cobras visíveis na tela dele, comida como eventos, controle de fila. */
function sendSnaps() {
  const S = sim, conns = Object.values(net.conns).filter(o => o.cur != null);
  const end = S.logBase + S.log.length;
  if (!conns.length) { S.log.length = 0; S.logBase = end; return; }
  snapN++;
  const pr = [];
  for (const s of S.sn) if (s.alive) {
    const e = encodePts(s.seg);
    pr.push({ s, bb: e.bb, d: { i: s.nid, c: s.ci, l: Math.round(s.len), k: s.kills, b: s.boost ? 1 : 0, a: +s.a.toFixed(2), x: e.x, y: e.y, p: e.p } });
  }
  let roster = null, lb = null;
  const needInfo = () => {
    if (!roster) {
      roster = S.sn.map(s => [s.nid, s.name]);
      lb = S.sn.filter(s => s.alive).sort((a, b) => b.len - a.len).slice(0, 5).map(s => [s.name, Math.round(s.len), s.ci]);
    }
  };
  let minCur = end;
  for (const o of conns) {
    const dc = o.c.dataChannel;
    if (!o.c.open || o.c.bufferSize > 2 || (dc && dc.bufferedAmount > 32768)) { minCur = Math.min(minCur, o.cur); continue; } /* rede engasgada: pula este quadro */
    const mine = pr.find(q => q.s.id === o.id);
    if (mine) { o.hx = mine.s.seg[0].x; o.hy = mine.s.seg[0].y; }
    const hw = (o.vw || 900) + 220, hh = (o.vh || 600) + 220, sn = [];
    for (const q of pr) {
      if (q === mine || (q.bb[2] > o.hx - hw && q.bb[0] < o.hx + hw && q.bb[3] > o.hy - hh && q.bb[1] < o.hy + hh)) sn.push(q.d);
    }
    const m = { t: 's', ev: S.log.slice(o.cur - S.logBase), sn };
    o.cur = end; minCur = Math.min(minCur, end);
    if (o.ro || snapN % 10 === 0) { needInfo(); m.ro = roster; m.lb = lb; o.ro = false; }
    safeSend(o.c, m);
  }
  const cut = minCur - S.logBase;
  if (cut > 0) { S.log.splice(0, cut); S.logBase = minCur; }
}

/* ---------- Menu ---------- */
function show(id) {
  document.querySelectorAll('.card').forEach(e => e.classList.toggle('hidden', e.id !== id));
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden');
}
function msg(t) { const m = $('msg'); m.textContent = t; m.classList.add('on'); clearTimeout(msg.t); msg.t = setTimeout(() => m.classList.remove('on'), 3000); }
function play(m, v) {
  mode = m; view = v; cam.x = v.W / 2; cam.y = v.H / 2; cam.len = 10; tickN = 0; snapN = 0; acc = 0; last = lastF = performance.now();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('boost').classList.toggle('hidden', !touch);
  if (m === 'host') startTicker(); else stopTicker();
}
function exit() {
  const n = net; net = {}; mode = null; sim = null; view = null; me = null; stopTicker();
  clearInterval(n.timer); clearInterval(n.watch); clearTimeout(n.to);
  try { if (n.peer) n.peer.destroy(); } catch (e) { }
  show('home');
}
$('bOnline').onclick = () => show('online');
$('bLocal').onclick = () => show('local');
document.querySelectorAll('.back').forEach(b => b.onclick = () => show('home'));
$('exit').onclick = exit; $('leave').onclick = exit;

/* O anfitrião roda a simulação num Worker: não congela (nem para a sala) quando a aba fica em segundo plano. */
function startTicker() {
  stopTicker();
  try {
    const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'], { type: 'text/javascript' }));
    ticker = new Worker(url); ticker.url = url; ticker.onmessage = () => pump(performance.now());
  } catch (e) { ticker = null; }
}
function stopTicker() { if (ticker) { ticker.terminate(); URL.revokeObjectURL(ticker.url); ticker = null; } }

/* ---------- Modo Local ---------- */
$('goLocal').onclick = () => {
  const h = +$('nh').value, b = +$('nb').value;
  if (touch && h > 1) msg('2 a 4 jogadores na mesma tela precisam de teclado.');
  sim = new Sim(1600, 1000); me = null;
  for (let i = 0; i < h; i++) sim.add('p' + i, h === 1 ? nm() : (i ? 'Jogador ' + (i + 1) : nm()), h === 1 ? 'me' : i);
  if (h === 1) me = 'p0';
  for (let i = 0; i < b; i++) sim.add('b' + i, 'Bot ' + (i + 1), 'bot');
  play('local', sim);
};

/* ---------- Modo Online: anfitrião ---------- */
$('create').onclick = () => {
  if (typeof Peer === 'undefined') return msg('Não foi possível carregar o PeerJS. Verifique a conexão.');
  const code = Array.from({ length: 5 }, () => CODEC[Math.random() * CODEC.length | 0]).join('');
  const p = new Peer('snakebattle-' + code, { config: ICE, debug: 0 });
  const N = net = { peer: p, host: true, conns: {}, code };
  N.to = setTimeout(() => { if (net === N && !N.ok) { msg('Servidor de salas indisponível. Tente de novo.'); exit(); } }, 12000);
  p.on('open', () => {
    N.ok = true; clearTimeout(N.to);
    $('roomCode').textContent = code; $('hostOnly').classList.remove('hidden'); $('wait').classList.add('hidden'); show('lobby'); sendLobby();
    N.watch = setInterval(() => { /* remove jogadores "fantasma" (sem sinal há 20s) */
      const now = performance.now();
      for (const id in N.conns) if (now - N.conns[id].seen > 20000) { try { N.conns[id].c.close(); } catch (e) { } drop(id); }
    }, 2000);
  });
  p.on('disconnected', () => { if (net === N && !p.destroyed) try { p.reconnect(); } catch (e) { } });
  p.on('error', e => {
    if (net !== N) return;
    if (e.type === 'unavailable-id') { exit(); $('create').onclick(); }
    else if (N.ok && (e.type === 'network' || e.type === 'webrtc' || e.type === 'peer-unavailable')) { /* erro isolado: a sala continua */ }
    else { msg('Erro de conexão: ' + e.type); exit(); }
  });
  p.on('connection', c => {
    c.on('data', m => onHost(c, m));
    c.on('close', () => drop(c.peer));
    c.on('error', () => { });
  });
};
function names() { return [nm(), ...Object.values(net.conns).map(o => o.name)]; }
function sendLobby() {
  const list = names(); showList(list);
  for (const o of Object.values(net.conns)) safeSend(o.c, { t: 'lobby', list });
}
function showList(list) { $('plist').innerHTML = list.map((n, i) => `<li>${i ? '' : '👑 '}${esc(n)}</li>`).join(''); }
function onHost(c, m) {
  const o = net.conns && net.conns[c.peer];
  if (o) o.seen = performance.now();
  if (m.t === 'hi') {
    if (o) return;
    if (Object.keys(net.conns).length >= MAXP - 1) { safeSend(c, { t: 'full' }); return void setTimeout(() => c.close(), 300); }
    net.conns[c.peer] = { c, id: c.peer, name: String(m.n || 'Jogador').slice(0, 12), seen: performance.now(), cur: null, ro: true };
    for (const x of Object.values(net.conns)) x.ro = true;
    if (sim) { sim.add(c.peer, net.conns[c.peer].name, 'net'); sendStart(c.peer); }
    sendLobby();
  } else if (m.t === 'in' && sim && o) {
    const s = sim.sn.find(s => s.id === c.peer);
    if (s) { s.input.aim = m.a == null ? null : +m.a; s.input.boost = !!m.b; }
    if (m.w > 0 && m.h > 0) { o.vw = Math.min(+m.w, 2500); o.vh = Math.min(+m.h, 2500); }
  }
}
function drop(id) {
  if (!net.conns || !net.conns[id]) return;
  delete net.conns[id];
  if (sim) sim.sn = sim.sn.filter(s => s.id !== id);
  for (const o of Object.values(net.conns)) o.ro = true;
  sendLobby();
}
function sendStart(id) {
  const o = net.conns[id], s = sim.sn.find(s => s.id === id); if (!o || !s) return;
  o.cur = sim.logBase + sim.log.length; o.ro = true; o.hx = sim.W / 2; o.hy = sim.H / 2;
  safeSend(o.c, { t: 'start', W: sim.W, H: sim.H, me: s.nid });
  const all = [...sim.food.values()]; /* comida inicial em blocos pequenos */
  for (let i = 0; i < all.length; i += 300) safeSend(o.c, { t: 'food', f: all.slice(i, i + 300) });
}
$('start').onclick = () => {
  if (!net.host) return;
  sim = new Sim(2800, 2800); sim.net = true; me = 'h';
  sim.add('h', nm(), 'me');
  for (const id in net.conns) sim.add(id, net.conns[id].name, 'net');
  for (let i = 0; i < +$('ob').value; i++) sim.add('b' + i, 'Bot ' + (i + 1), 'bot');
  play('host', sim);
  for (const id in net.conns) sendStart(id);
};

/* ---------- Modo Online: cliente ---------- */
$('join').onclick = () => {
  const code = $('code').value.trim().toUpperCase();
  if (typeof Peer === 'undefined') return msg('Não foi possível carregar o PeerJS. Verifique a conexão.');
  if (code.length < 4) return msg('Digite o código da sala.');
  const p = new Peer(undefined, { config: ICE, debug: 0 });
  const N = net = { peer: p, host: false };
  N.to = setTimeout(() => { if (net === N && !N.ok) { msg('Não foi possível conectar à sala. Tente de novo.'); exit(); } }, 15000);
  p.on('open', () => {
    const c = N.conn = p.connect('snakebattle-' + code, { reliable: true, serialization: 'json' });
    c.on('open', () => {
      if (net !== N) return;
      N.ok = true; clearTimeout(N.to); N.rx = performance.now();
      c.send({ t: 'hi', n: nm() });
      $('roomCode').textContent = code; $('hostOnly').classList.add('hidden'); $('wait').classList.remove('hidden'); show('lobby');
      let n = 0;
      N.timer = setInterval(() => {
        if (!c.open) return;
        if (mode === 'client') {
          c.send({ t: 'in', a: myIn.aim == null ? null : +myIn.aim.toFixed(2), b: myIn.boost ? 1 : 0, w: Math.round(vext[0]), h: Math.round(vext[1]) });
          if (performance.now() - N.rx > 8000) { msg('Conexão com a sala perdida.'); exit(); }
        } else if (++n % 20 === 0) c.send({ t: 'p' });
      }, 50);
    });
    c.on('data', m => { if (net === N) { N.rx = performance.now(); onClient(m); } });
    c.on('close', () => { if (net !== N) return; msg('A sala foi encerrada.'); exit(); });
    c.on('error', () => { });
  });
  p.on('disconnected', () => { if (net === N && !p.destroyed) try { p.reconnect(); } catch (e) { } });
  p.on('error', e => {
    if (net !== N) return;
    if (e.type === 'peer-unavailable') { msg('Sala não encontrada.'); exit(); }
    else if (N.ok && (e.type === 'network' || e.type === 'webrtc')) { /* instabilidade: o watchdog decide */ }
    else { msg('Erro de conexão: ' + e.type); exit(); }
  });
};
function onClient(m) {
  if (m.t === 'lobby') showList(m.list);
  else if (m.t === 'full') { msg('Sala cheia.'); exit(); }
  else if (m.t === 'start') {
    me = m.me; play('client', { W: m.W, H: m.H, sn: [], food: new Map(), names: new Map(), lb: null });
  } else if (m.t === 'food' && view) {
    for (const f of m.f) view.food.set(f[0], f);
  } else if (m.t === 's' && view) {
    for (const e of m.ev) { if (typeof e === 'number') view.food.delete(e); else view.food.set(e[0], e); }
    if (m.ro) view.names = new Map(m.ro);
    if (m.lb) view.lb = m.lb;
    const old = new Map(view.sn.map(s => [s.id, s]));
    view.sn = m.sn.map(d => {
      const pts = decodePts(d);
      let s = old.get(d.i);
      if (!s || Math.hypot(s.seg[0].x - d.x, s.seg[0].y - d.y) > 250) s = { id: d.i, seg: pts.map(p => ({ x: p.x, y: p.y })) }; /* nascimento/respawn: sem "rastro" */
      return Object.assign(s, { name: view.names.get(d.i) || '', ci: d.c, color: COL[d.c], len: d.l, kills: d.k, boost: d.b, a: d.a, tgt: pts });
    });
  }
}
function smooth(dt) {
  const k = 1 - Math.exp(-dt * 22);
  for (const s of view.sn) {
    const t = s.tgt; if (!t) continue;
    for (let i = 0; i < t.length; i++) {
      if (!s.seg[i]) s.seg[i] = { x: t[i].x, y: t[i].y };
      else { s.seg[i].x += (t[i].x - s.seg[i].x) * k; s.seg[i].y += (t[i].y - s.seg[i].y) * k; }
    }
    s.seg.length = t.length;
  }
}

/* ---------- Entrada ---------- */
addEventListener('keydown', e => { keys[e.code] = true; if (mode && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault(); });
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; down = false; bst = false; });
const stick = $('stick'), knob = $('knob'), bb = $('boost');
const aimMouse = e => { mouse.on = true; mouse.x = e.clientX; mouse.y = e.clientY; };
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touch = true; bb.classList.remove('hidden');
    if (jo) return;
    jo = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stick.style.left = jo.x + 'px'; stick.style.top = jo.y + 'px'; stick.classList.remove('hidden');
    knob.style.transform = 'translate(-50%,-50%)';
  } else { down = true; aimMouse(e); }
});
cv.addEventListener('pointermove', e => {
  if (e.pointerType !== 'touch') return aimMouse(e);
  if (!jo || e.pointerId !== jo.id) return;
  const dx = e.clientX - jo.x, dy = e.clientY - jo.y, d = Math.hypot(dx, dy), k = Math.min(d, 45) / (d || 1);
  if (d > 12) { myIn.aim = Math.atan2(dy, dx); mouse.on = false; }
  knob.style.transform = `translate(calc(-50% + ${dx * k}px),calc(-50% + ${dy * k}px))`;
});
const endPtr = e => {
  if (jo && e.pointerId === jo.id) { jo = null; stick.classList.add('hidden'); }
  else if (e.pointerType !== 'touch') down = false;
  if (e.pointerId === bid) { bid = null; bst = false; bb.classList.remove('on'); }
};
addEventListener('pointerup', endPtr); addEventListener('pointercancel', endPtr);
bb.addEventListener('pointerdown', e => { e.stopPropagation(); bid = e.pointerId; bst = true; bb.classList.add('on'); });
function keyAim() {
  const vx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const vy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  if (vx || vy) { myIn.aim = Math.atan2(vy, vx); mouse.on = false; }
}
/* Mira do mouse em coordenadas do mundo (corrige o modo local, onde a cabeça não fica no centro da tela). */
function mouseAim() {
  if (!mouse.on || !tf || !view || me == null) return;
  const m = view.sn.find(s => s.id === me);
  if (!m || m.alive === false || !m.seg || !m.seg.length) return;
  const wx = (mouse.x * DPR - tf.w / 2) / tf.sc + tf.cx, wy = (mouse.y * DPR - tf.h / 2) / tf.sc + tf.cy;
  const dx = wx - m.seg[0].x, dy = wy - m.seg[0].y;
  if (dx * dx + dy * dy > 4) myIn.aim = Math.atan2(dy, dx);
}
function readInputs() {
  for (const s of sim.sn) {
    if (typeof s.ctrl === 'number') {
      const k = KEYS[s.ctrl]; s.input.l = keys[k[0]] ? 1 : 0; s.input.r = keys[k[1]] ? 1 : 0; s.input.boost = !!keys[k[2]];
    } else if (s.ctrl === 'me') { s.input.aim = myIn.aim; s.input.boost = myIn.boost; }
  }
}

/* ---------- Desenho ---------- */
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(innerWidth * DPR); cv.height = Math.round(innerHeight * DPR); }
addEventListener('resize', resize); resize();
const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); };

function draw(v) {
  const w = cv.width, h = cv.height;
  ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, w, h);
  let sc, cx = v.W / 2, cy = v.H / 2;
  if (mode === 'local') sc = Math.min(w / v.W, h / v.H) * .97;
  else {
    const m = v.sn.find(s => s.id === me);
    if (m && m.seg.length) { cam.x = m.seg[0].x; cam.y = m.seg[0].y; cam.len = m.len; }
    sc = Math.min(w, h) / (innerWidth < 600 || innerHeight < 500 ? 620 : 750) * Math.max(.55, 1 - cam.len * .0012); cx = cam.x; cy = cam.y;
  }
  tf = { sc, cx, cy, w, h }; vext = [w / 2 / sc, h / 2 / sc];
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  const x0 = cx - w / 2 / sc, x1 = cx + w / 2 / sc, y0 = cy - h / 2 / sc, y1 = cy + h / 2 / sc;
  ctx.fillStyle = '#070c16'; ctx.fillRect(0, 0, v.W, v.H);
  ctx.strokeStyle = 'rgba(24,230,255,.09)'; ctx.lineWidth = 1.5 / sc; ctx.beginPath();
  const gy0 = Math.max(0, y0), gy1 = Math.min(v.H, y1), gx0 = Math.max(0, x0), gx1 = Math.min(v.W, x1);
  for (let x = Math.max(0, Math.floor(x0 / 60) * 60); x <= gx1; x += 60) { ctx.moveTo(x, gy0); ctx.lineTo(x, gy1); }
  for (let y = Math.max(0, Math.floor(y0 / 60) * 60); y <= gy1; y += 60) { ctx.moveTo(gx0, y); ctx.lineTo(gx1, y); }
  ctx.stroke();
  ctx.shadowColor = '#18e6ff'; ctx.shadowBlur = 24; ctx.lineWidth = 6; ctx.strokeStyle = '#18e6ff'; ctx.strokeRect(0, 0, v.W, v.H); ctx.shadowBlur = 0;
  for (const f of v.food.values()) {
    if (f[1] < x0 || f[1] > x1 || f[2] < y0 || f[2] > y1) continue;
    const fr = 2.5 + f[4] * 1.8; ctx.fillStyle = COL[f[3]];
    ctx.globalAlpha = .22; dot(f[1], f[2], fr * 2.3); ctx.globalAlpha = 1; dot(f[1], f[2], fr);
  }
  for (const s of [...v.sn].sort((a, b) => a.len - b.len)) {
    if (s.alive === false || !s.seg.length) continue;
    const r = R(s);
    let vis = false;
    for (let i = 0; i < s.seg.length; i += 3) { const p = s.seg[i]; if (p.x > x0 - r * 3 && p.x < x1 + r * 3 && p.y > y0 - r * 3 && p.y < y1 + r * 3) { vis = true; break; } }
    if (!vis) continue; /* não desenha cobras fora da tela */
    if (s.boost) { ctx.fillStyle = s.color; ctx.globalAlpha = .16; for (let i = 0; i < s.seg.length; i += 2) dot(s.seg[i].x, s.seg[i].y, r + 6); ctx.globalAlpha = 1; }
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.3)';
    for (let i = s.seg.length - 1; i >= 0; i--) {
      const p = s.seg[i];
      ctx.fillStyle = s.color; dot(p.x, p.y, r); ctx.stroke();
      if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,.08)'; dot(p.x, p.y, r); }
    }
    const p = s.seg[0], ca = Math.cos(s.a), sa = Math.sin(s.a);
    for (const k of [-1, 1]) {
      const ex = p.x + ca * r * .35 - sa * k * r * .55, ey = p.y + sa * r * .35 + ca * k * r * .55;
      ctx.fillStyle = '#fff'; dot(ex, ey, r * .45);
      ctx.fillStyle = '#111'; dot(ex + ca * r * .15, ey + sa * r * .15, r * .22);
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'center'; ctx.font = `600 ${13 * DPR / sc}px sans-serif`;
    ctx.fillText(s.name, p.x, p.y - r - 8);
  }
  ctx.restore();
}

function hud(v) {
  const alive = v.sn.filter(s => s.alive !== false);
  const top = v.lb || alive.sort((a, b) => b.len - a.len).slice(0, 5).map(s => [s.name, s.len, s.ci]);
  $('board').innerHTML = top.map(t => `<li style="color:${COL[t[2]]}"><span>${esc(t[0])}</span><b>${Math.round(t[1])}</b></li>`).join('');
  const m = me != null && alive.find(s => s.id === me);
  $('score').textContent = m ? `Tamanho ${Math.round(m.len)} · Abates ${m.kills}` : '';
  $('score').classList.toggle('hidden', me == null);
  $('dead').classList.toggle('hidden', me == null || !!m);
}

/* ---------- Loop ---------- */
/* Simulação com passo fixo; usada pelo desenho (rAF) e, no anfitrião, também pelo Worker. */
function pump(now) {
  if (!sim || !mode) return;
  let dt = (now - last) / 1000; last = now;
  if (dt > .25) dt = .25;
  acc += dt;
  let n = 0, snap = false;
  while (acc >= DT) {
    if (++n > 10) { acc = 0; break; } /* evita "espiral da morte" em máquina lenta */
    readInputs(); sim.step(); acc -= DT; tickN++;
    if (mode === 'host' && tickN % 3 === 0) snap = true;
  }
  if (snap) sendSnaps();
}
function loop() {
  requestAnimationFrame(loop);
  if (!mode) return;
  mouseAim(); keyAim(); myIn.boost = down || bst || !!keys.Space;
  const now = performance.now();
  if (sim) pump(now); else smooth(Math.min(.1, (now - lastF) / 1000));
  lastF = now;
  draw(view);
  if (++frame % 10 === 0) hud(view);
}
requestAnimationFrame(loop);
