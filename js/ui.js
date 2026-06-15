// ===================================================================
//  Connect 5 Dinámico — controlador de interfaz.
// ===================================================================
import { Connect5 } from './game.js';
import { chooseMove } from './ai.js';
import { NetGame, peerErrMsg } from './net.js';
import { Sfx, setSound, isSoundOn, unlock } from './audio.js';

const $ = (sel) => document.querySelector(sel);

// ---- Estado global ----
let game = null;
let mode = null;          // 'ai' | 'local' | 'online'
let net = null;
let myPlayer = 1;         // jugador local (ai/online)
let selected = 'normal';  // habilidad seleccionada
let busy = false;         // animaciones en curso
let cellEls = [];         // cellEls[r][c]
let shown = [];           // tablero mostrado actualmente

const ABIL_META = {
  bomb:  { em: '💣', name: 'Bomba' },
  block: { em: '🧱', name: 'Bloque' },
  freeze:{ em: '🧊', name: 'Congelar' },
  swap:  { em: '🔄', name: 'Cambio' },
};

// ===================================================================
//  Navegación entre pantallas
// ===================================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function backToMenu() {
  if (net) { net.destroy(); net = null; }
  mode = null;
  $('#net-status').classList.add('hidden');
  showScreen('menu');
}

// ===================================================================
//  Construcción y render del tablero
// ===================================================================
function buildBoard() {
  const board = $('#board');
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${game.cols}, 1fr)`;
  cellEls = Array.from({ length: game.rows }, () => Array(game.cols));
  shown = Array.from({ length: game.rows }, () => Array(game.cols).fill(0));
  // Filas de arriba (rows-1) hacia abajo (0).
  for (let dr = game.rows - 1; dr >= 0; dr--) {
    for (let c = 0; c < game.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = dr;
      cell.dataset.c = c;
      board.appendChild(cell);
      cellEls[dr][c] = cell;
    }
  }
}

function makeDisc(player) {
  const d = document.createElement('div');
  d.className = 'disc p' + player;
  return d;
}

// Sincroniza el DOM con el estado lógico, animando los cambios.
function syncBoard(ev = {}) {
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const logical = game.board[r][c];
      const cur = shown[r][c];
      const cell = cellEls[r][c];
      if (logical === cur) continue;

      if (logical === 0 && cur !== 0) {
        // se eliminó
        const d = cell.querySelector('.disc');
        if (d) { d.classList.add('removing'); const el = d; setTimeout(() => el.remove(), 350); }
      } else if (cur === 0 && logical !== 0) {
        // nueva ficha
        const d = makeDisc(logical);
        cell.appendChild(d);
      } else {
        // cambió de color (swap)
        const d = cell.querySelector('.disc');
        if (d) { d.className = 'disc p' + logical + ' swapped'; }
        else cell.appendChild(makeDisc(logical));
      }
      shown[r][c] = logical;
    }
  }
  renderFrozen();
  if (ev.winner) markWinning(ev.winningCells);
}

function renderFrozen() {
  // limpia
  document.querySelectorAll('.cell.frozen').forEach((c) => c.classList.remove('frozen'));
  for (const f of game.frozen) {
    let r = game.dropRow(f.col);
    if (r < 0) r = game.rows - 1;
    cellEls[r] && cellEls[r][f.col] && cellEls[r][f.col].classList.add('frozen');
  }
}

function markWinning(cells = []) {
  for (const { r, c } of cells) {
    const d = cellEls[r][c].querySelector('.disc');
    if (d) d.classList.add('win');
  }
}

// ---- Efectos visuales ----
function renderEffects(ev) {
  if (ev.type === 'bomb' && ev.center) spawnBoom(ev.center, ev.removed || []);
  if (ev.type === 'swap' && ev.swap) spawnSparks(ev.swap, 10);
}

function cellCenter(r, c) {
  const cell = cellEls[r][c];
  return { x: cell.offsetLeft + cell.offsetWidth / 2, y: cell.offsetTop + cell.offsetHeight / 2 };
}

function spawnBoom(center, removed) {
  const board = $('#board');
  const { x, y } = cellCenter(center.r, center.c);
  const boom = document.createElement('div');
  boom.className = 'boom';
  boom.style.left = x + 'px';
  boom.style.top = y + 'px';
  board.appendChild(boom);
  setTimeout(() => boom.remove(), 600);
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    const ang = (Math.PI * 2 * i) / 16;
    const dist = 60 + Math.random() * 60;
    s.style.transition = 'transform .6s ease-out, opacity .6s';
    board.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 650);
  }
}

function spawnSparks(at, n) {
  const board = $('#board');
  const { x, y } = cellCenter(at.r, at.c);
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.background = '#2ee6c5';
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    const ang = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    s.style.transition = 'transform .5s ease-out, opacity .5s';
    board.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 550);
  }
}

// ===================================================================
//  Sonido por tipo de jugada
// ===================================================================
function playSfx(ev) {
  if (ev.winner) { ev.winner === myPlayer || mode === 'local' ? Sfx.win() : Sfx.lose(); return; }
  switch (ev.type) {
    case 'bomb': Sfx.bomb(); break;
    case 'block': Sfx.block(); break;
    case 'freeze': Sfx.freeze(); break;
    case 'swap': Sfx.swap(); break;
    default: Sfx.drop();
  }
}

// ===================================================================
//  HUD y panel de habilidades
// ===================================================================
function canInteract() {
  if (!game || game.winner || game.draw || busy) return false;
  if (mode === 'local') return true;
  if (mode === 'ai') return game.current === 1;
  if (mode === 'online') return game.current === myPlayer;
  return false;
}

function playerName(p) {
  if (mode === 'ai') return p === 1 ? 'Tú' : 'Máquina';
  if (mode === 'online') return p === myPlayer ? 'Tú' : 'Rival';
  return p === 1 ? 'Rojo' : 'Amarillo';
}

function updateHud() {
  const pill = $('#turn-pill');
  pill.className = 'turn-pill p' + game.current;
  const color = game.current === 1 ? 'Rojo' : 'Amarillo';
  $('#turn-text').textContent = `Turno: ${playerName(game.current)} (${color})`;
  renderAbilities();
}

function renderAbilities() {
  const wrap = $('#abilities');
  wrap.innerHTML = '';
  const inv = game.inventory[game.current];
  const interactive = canInteract();

  // Botón ficha normal
  wrap.appendChild(makeAbilBtn('normal', '⚪', 'Normal', '∞', interactive));
  for (const key of ['bomb', 'block', 'freeze', 'swap']) {
    const m = ABIL_META[key];
    wrap.appendChild(makeAbilBtn(key, m.em, m.name, inv[key], interactive && inv[key] > 0));
  }
}

function makeAbilBtn(key, em, name, count, enabled) {
  const b = document.createElement('button');
  b.className = 'abil' + (selected === key ? ' selected' : '');
  b.disabled = !enabled;
  b.innerHTML = `<span class="em">${em}</span><span>${name}</span><span class="count">${count}</span>`;
  b.onclick = () => {
    if (b.disabled) return;
    Sfx.click();
    selected = key;
    renderAbilities();
    showHint();
    refreshTargetable();
  };
  return b;
}

function showHint() {
  const h = $('#hint');
  if (!canInteract()) { h.textContent = game.winner || game.draw ? '' : 'Esperando al rival…'; return; }
  const tips = {
    normal: 'Toca una columna para soltar tu ficha.',
    bomb: '💣 Toca una columna: la ficha caerá y explotará.',
    block: '🧱 Toca una columna con 2 huecos: colocas 2 fichas.',
    freeze: '🧊 Toca una columna para congelarla al rival un turno.',
    swap: '🔄 Toca una ficha del rival para convertirla en tuya.',
  };
  h.textContent = tips[selected];
}

function refreshTargetable() {
  document.querySelectorAll('.cell.target-able').forEach((c) => c.classList.remove('target-able'));
  if (selected === 'swap' && canInteract()) {
    const opp = game.opponent(game.current);
    for (let r = 0; r < game.rows; r++)
      for (let c = 0; c < game.cols; c++)
        if (game.board[r][c] === opp) cellEls[r][c].classList.add('target-able');
  }
}

// ===================================================================
//  Lógica de jugadas
// ===================================================================
function applyAndRender(move) {
  const ev = game.applyMove(move);
  if (!ev.ok) return null;
  renderEffects(ev);
  playSfx(ev);
  // Para la bomba, dejamos respirar la animación antes de seguir.
  if (ev.type === 'bomb') {
    busy = true;
    setTimeout(() => { busy = false; afterTurn(); }, 600);
  }
  syncBoard(ev);
  updateHud();
  showHint();
  if (ev.winner || ev.draw) endGame(ev);
  return ev;
}

function localMove(move) {
  if (!canInteract()) return;
  if (!game.isLegal(move)) { $('#hint').textContent = '✋ Movimiento no válido.'; return; }
  unlock();
  const ev = applyAndRender(move);
  if (!ev) return;
  if (mode === 'online') net.send({ type: 'move', move });
  selected = 'normal';
  refreshTargetable();
  if (ev.type !== 'bomb') afterTurn();
}

function afterTurn() {
  if (game.winner || game.draw) return;
  renderAbilities();
  showHint();
  if (mode === 'ai' && game.current === 2) {
    setTimeout(() => {
      if (game.winner || game.draw) return;
      const mv = chooseMove(game, 2);
      const ev = applyAndRender(mv);
      if (ev && ev.type !== 'bomb') afterTurn();
    }, 550);
  }
}

function onCellActivate(r, c) {
  if (!canInteract()) return;
  if (selected === 'swap') {
    localMove({ type: 'swap', target: { r, c } });
  } else {
    localMove({ type: selected, col: c });
  }
}

// ===================================================================
//  Fin de partida
// ===================================================================
function endGame(ev) {
  setTimeout(() => {
    const modal = $('#endmodal');
    const title = $('#end-title');
    const sub = $('#end-sub');
    if (ev.draw) {
      title.textContent = '🤝 ¡Empate!';
      sub.textContent = 'El tablero se llenó sin un ganador.';
    } else {
      const w = ev.winner;
      const color = w === 1 ? 'Rojo' : 'Amarillo';
      if (mode === 'local') { title.textContent = `🏆 ¡Gana ${color}!`; sub.textContent = '5 en línea.'; }
      else if (w === myPlayer) { title.textContent = '🎉 ¡Ganaste!'; sub.textContent = '¡Bien jugado!'; }
      else { title.textContent = '😵 Perdiste'; sub.textContent = mode === 'ai' ? 'La máquina conectó 5.' : 'Tu rival conectó 5.'; }
    }
    modal.classList.remove('hidden');
  }, ev.winningCells && ev.winningCells.length ? 700 : 300);
}

// ===================================================================
//  Inicio de partidas
// ===================================================================
function startGame(newMode) {
  mode = newMode;
  game = new Connect5();
  selected = 'normal';
  busy = false;
  if (mode === 'ai') myPlayer = 1;
  if (mode === 'local') myPlayer = 1;
  buildBoard();
  syncBoard();
  updateHud();
  showHint();
  refreshTargetable();
  showScreen('game');
}

function resetGame() {
  game = new Connect5();
  selected = 'normal';
  busy = false;
  buildBoard();
  syncBoard();
  updateHud();
  showHint();
  $('#endmodal').classList.add('hidden');
}

// ===================================================================
//  Online
// ===================================================================
function lobbyError(msg) {
  const hostEl = $('#lobby-status');
  const guestEl = $('#join-status');
  const isHost = !$('#lobby-host').classList.contains('hidden');
  const el = isHost ? hostEl : guestEl;
  if (el) { el.textContent = '⚠️ ' + msg; el.style.color = '#ff6b8a'; }
  // Mostrar botón reintentar solo en modo host (el guest no puede reintentar sin enlace nuevo)
  if (isHost) $('#lobby-retry').classList.remove('hidden');
}

function openLobbyAsHost() {
  $('#lobby-host').classList.remove('hidden');
  $('#lobby-join').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
  const statusEl = $('#lobby-status');
  statusEl.textContent = 'Creando sala…';
  statusEl.style.color = '';

  net = new NetGame();
  setupNetHandlers();
  net.host().then((id) => {
    const url = `${location.origin}${location.pathname}?join=${id}`;
    $('#share-link').value = url;
    statusEl.textContent = '✅ Sala lista. Esperando al rival…';
    statusEl.style.color = '#2ee6c5';
  }).catch((err) => {
    lobbyError(peerErrMsg(err));
  });
}

function openLobbyAsGuest(hostId) {
  $('#lobby-host').classList.add('hidden');
  $('#lobby-join').classList.remove('hidden');
  $('#lobby').classList.remove('hidden');
  const statusEl = $('#join-status');
  statusEl.textContent = '🔄 Conectando con el anfitrión…';
  statusEl.style.color = '';

  net = new NetGame();
  setupNetHandlers();
  net.join(hostId);
}

function setupNetHandlers() {
  const inLobby = () => !$('#lobby').classList.contains('hidden');

  net.onConnected = () => {
    myPlayer = net.myPlayer;
    $('#lobby').classList.add('hidden');
    startGame('online');
    $('#net-status').classList.remove('hidden');
    $('#net-status').textContent = `🟢 Conectado · eres ${myPlayer === 1 ? 'Rojo' : 'Amarillo'}`;
  };

  net.onMessage = (data) => {
    if (!data) return;
    if (data.type === 'move') {
      applyAndRender(data.move);
      if (!game.winner && !game.draw) { renderAbilities(); showHint(); }
    } else if (data.type === 'restart') {
      resetGame();
    }
  };

  net.onStatus = (s, err) => {
    if (s === 'error') {
      const msg = peerErrMsg(err);
      if (inLobby()) {
        lobbyError(msg);
      } else {
        $('#net-status').textContent = '🔴 Error de conexión';
        $('#hint').textContent = '⚠️ ' + msg;
      }
    } else if (s === 'closed') {
      if (!inLobby()) {
        $('#net-status').textContent = '🔴 Rival desconectado';
        $('#hint').textContent = 'La conexión se cerró.';
      }
    } else if (s === 'connecting') {
      const el = $('#join-status');
      if (el) el.textContent = '🔄 Negociando conexión WebRTC…';
    } else if (s === 'peer-found') {
      const el = $('#lobby-status');
      if (el) { el.textContent = '⚡ Rival encontrado, estableciendo conexión…'; el.style.color = '#ffd23b'; }
    }
  };
}

// ===================================================================
//  Rotación 3D con arrastre
// ===================================================================
let rotX = 14, rotY = 0;
let dragging = false, sx = 0, sy = 0, baseX = 0, baseY = 0, moved = false;

function applyTilt() {
  $('#board-tilt').style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
}

function initTilt() {
  const tilt = $('#board-tilt');
  applyTilt();
  tilt.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY; baseX = rotX; baseY = rotY;
    tilt.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    rotY = Math.max(-45, Math.min(45, baseY + dx * 0.3));
    rotX = Math.max(-15, Math.min(55, baseX - dy * 0.3));
    applyTilt();
  });
  window.addEventListener('pointerup', () => {
    if (dragging) { dragging = false; tilt.classList.remove('dragging'); }
  });
}

// ===================================================================
//  Wiring de eventos
// ===================================================================
function init() {
  // Menú
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.addEventListener('click', () => {
      unlock(); Sfx.click();
      const m = b.dataset.mode;
      if (m === 'online') openLobbyAsHost();
      else startGame(m);
    });
  });

  $('#how-btn').onclick = () => $('#help').classList.remove('hidden');
  document.querySelector('.help-close').onclick = () => $('#help').classList.add('hidden');

  // HUD
  $('#back-btn').onclick = () => { Sfx.click(); backToMenu(); };
  $('#restart-btn').onclick = () => {
    Sfx.click();
    if (mode === 'online') { net.send({ type: 'restart' }); resetGame(); }
    else resetGame();
  };
  $('#sound-btn').onclick = () => {
    const on = !isSoundOn();
    setSound(on);
    $('#sound-btn').textContent = on ? '🔊' : '🔇';
    if (on) { unlock(); Sfx.click(); }
  };

  // Tablero (delegación de clic + hover de columna)
  const board = $('#board');
  board.addEventListener('click', (e) => {
    if (moved) { moved = false; return; } // fue un arrastre, no un clic
    const cell = e.target.closest('.cell');
    if (!cell) return;
    onCellActivate(+cell.dataset.r, +cell.dataset.c);
  });
  board.addEventListener('pointermove', (e) => {
    const cell = e.target.closest && e.target.closest('.cell');
    document.querySelectorAll('.col-hot').forEach((c) => c.classList.remove('col-hot'));
    if (!cell || dragging || selected === 'swap' || !canInteract()) return;
    const c = +cell.dataset.c;
    for (let r = 0; r < game.rows; r++) cellEls[r][c].classList.add('col-hot');
  });
  board.addEventListener('pointerleave', () => {
    document.querySelectorAll('.col-hot').forEach((c) => c.classList.remove('col-hot'));
  });

  // Modales
  $('#play-again').onclick = () => {
    Sfx.click();
    if (mode === 'online') { net.send({ type: 'restart' }); resetGame(); }
    else resetGame();
  };
  $('#end-menu').onclick = () => { $('#endmodal').classList.add('hidden'); backToMenu(); };
  document.querySelector('.lobby-cancel').onclick = () => {
    $('#lobby').classList.add('hidden');
    $('#lobby-retry').classList.add('hidden');
    if (net) { net.destroy(); net = null; }
  };
  $('#lobby-retry').onclick = () => {
    if (net) { net.destroy(); net = null; }
    $('#lobby-retry').classList.add('hidden');
    openLobbyAsHost();
  };
  $('#copy-link').onclick = () => {
    const inp = $('#share-link');
    inp.select();
    navigator.clipboard && navigator.clipboard.writeText(inp.value);
    $('#copy-link').textContent = '¡Copiado!';
    setTimeout(() => ($('#copy-link').textContent = 'Copiar'), 1500);
  };

  initTilt();

  // ¿Llegamos por un enlace de invitación?
  const params = new URLSearchParams(location.search);
  const joinId = params.get('join');
  if (joinId) {
    history.replaceState(null, '', location.pathname);
    openLobbyAsGuest(joinId);
  }
}

document.addEventListener('DOMContentLoaded', init);
