// ===================================================================
//  Connect 5 Dinámico — controlador de interfaz.
// ===================================================================
import { Connect5 } from './game.js';
import { chooseMove } from './ai.js';
import { NetGame, peerErrMsg } from './net.js';
import { Sfx, setSound, isSoundOn, unlock } from './audio.js';
import { log, bindLogUI, markSeen, downloadLog, clearLog, asText } from './logger.js';

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

// ---- Sincronización online (estado autoritativo + reenvío) ----
let lastAppliedSeq = 0;   // mayor moveCount aplicado desde el rival
let lastSentSeq = 0;      // moveCount del último estado que envié
let resendTimer = null;   // reintento del último estado hasta recibir ack
let lastSentMsg = null;   // último mensaje de estado enviado

// ---- Dificultad IA, marcador, temporizador y chat ----
let aiDifficulty = 'medio';                  // 'facil' | 'medio' | 'dificil'
let difmodalOpenedAt = 0;                    // timestamp para evitar ghost-click en móvil
let score = { me: 0, opp: 0, draws: 0 };     // marcador de la sesión
const TURN_SECONDS = 7;                       // límite de tiempo por jugada
let turnTimer = null, turnDeadline = 0;       // temporizador del turno
let chatUnseen = 0;                           // mensajes de chat sin leer

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
  stopResend();
  clearTurnTimer();
  if (net) { net.destroy(); net = null; log('red', 'Conexión cerrada (volver al menú).'); }
  mode = null;
  score = { me: 0, opp: 0, draws: 0 }; // el marcador es por sesión de modo
  clearChat();
  $('#net-status').classList.add('hidden');
  $('#chat-btn').classList.add('hidden');
  showScreen('menu');
}

// Reinicia los contadores de sincronización online.
function resetSync() {
  lastAppliedSeq = 0;
  lastSentSeq = 0;
  lastSentMsg = null;
  stopResend();
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
        // nueva ficha — animación de caída desde lo alto de la columna
        const d = makeDisc(logical);
        const cellH = cell.offsetHeight || 40;
        const gap = 6; // --gap
        const natural = 14 + 20 + r * (cellH + gap) + cellH * 0.5;
        const fallFrom = -Math.max(natural, 80); // mínimo 80px para que siempre se vea
        const dur = Math.max(0.18, Math.abs(fallFrom) / 700).toFixed(2);
        d.style.setProperty('--fall-from', `${fallFrom}px`);
        d.style.setProperty('--fall-dur', `${dur}s`);
        d.classList.add('falling');
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
  document.querySelectorAll('.cell.frozen-col').forEach((c) => c.classList.remove('frozen-col'));
  document.querySelectorAll('.freeze-badge').forEach((b) => b.remove());
  for (const f of game.frozen) {
    // Escarcha en toda la columna.
    for (let r = 0; r < game.rows; r++) {
      cellEls[r] && cellEls[r][f.col] && cellEls[r][f.col].classList.add('frozen-col');
    }
    // Hielo en el hueco bloqueado (próxima caída) o arriba si está llena.
    let r = game.dropRow(f.col);
    if (r < 0) r = game.rows - 1;
    cellEls[r] && cellEls[r][f.col] && cellEls[r][f.col].classList.add('frozen');
    // Contador de turnos restantes sobre la columna.
    const top = cellEls[game.rows - 1] && cellEls[game.rows - 1][f.col];
    if (top) {
      const badge = document.createElement('div');
      badge.className = 'freeze-badge';
      badge.textContent = '❄️ ' + f.turns;
      top.appendChild(badge);
    }
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
  renderScore();
}

function renderScore() {
  const el = $('#scoreboard');
  let a, b;
  if (mode === 'ai') { a = 'Tú'; b = 'IA'; }
  else if (mode === 'online') { a = 'Tú'; b = 'Rival'; }
  else if (mode === 'local') { a = 'Rojo'; b = 'Amarillo'; }
  else { el.textContent = ''; return; }
  el.innerHTML =
    `<span class="sc-a">${a} ${score.me}</span>` +
    `<span class="sc-mid">—</span>` +
    `<span class="sc-b">${score.opp} ${b}</span>` +
    (score.draws ? `<span class="sc-d">· ${score.draws} 🤝</span>` : '');
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
    freeze: '🧊 Toca una columna para congelarla al rival sus próximos 3 turnos.',
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
  if (!ev.ok) { log('error', `Movimiento rechazado: ${describeMove(move)} (turno de jugador ${game.current})`); return null; }
  // Registrar quién jugó qué (todos los modos).
  const who = mode === 'ai' ? (ev.player === 1 ? 'Tú' : 'Máquina')
            : mode === 'online' ? (ev.player === myPlayer ? 'Tú' : 'Rival')
            : `Jugador ${ev.player}`;
  log('juego', `Turno #${game.moveCount}: ${who} jugó ${describeMove(move)}.`);
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
  clearTurnTimer(); // el turno se consume; el siguiente reinicia el reloj
  const ev = applyAndRender(move);
  if (!ev) return;
  if (mode === 'online') {
    sendState(ev);
  }
  selected = 'normal';
  refreshTargetable();
  if (ev.type !== 'bomb') afterTurn();
}

function describeMove(move) {
  const names = { normal: 'ficha', bomb: '💣 bomba', block: '🧱 bloque', freeze: '🧊 congelar', swap: '🔄 cambio' };
  const where = move.type === 'swap' ? `en (f${move.target.r},c${move.target.c})` : `en columna ${move.col}`;
  return `${names[move.type] || move.type} ${where}`;
}

// Envía el estado COMPLETO + efectos del último movimiento, y lo reenvía
// hasta recibir confirmación (ack). Garantiza que el rival nunca se desincronice.
function sendState(ev) {
  lastSentSeq = game.moveCount;
  const fx = ev ? {
    type: ev.type, removed: ev.removed, center: ev.center,
    swap: ev.swap, freezeCol: ev.freezeCol, winner: ev.winner, draw: ev.draw,
  } : null;
  lastSentMsg = { type: 'state', seq: game.moveCount, state: game.toState(), fx };
  net.send(lastSentMsg);
  log('red', `Estado enviado (seq ${lastSentMsg.seq}), esperando ack…`);
  startResend();
}

function startResend() {
  stopResend();
  let tries = 0;
  resendTimer = setInterval(() => {
    if (!net || !lastSentMsg) { stopResend(); return; }
    tries++;
    if (tries > 8) { // ~20s sin ack
      stopResend();
      log('error', 'El rival no confirmó la jugada tras varios reintentos. Posible desconexión.');
      $('#net-status').textContent = '🟠 Sin respuesta del rival…';
      return;
    }
    net.send(lastSentMsg);
    log('red', `Reenvío estado (seq ${lastSentMsg.seq}), intento ${tries}`);
  }, 2500);
}

function stopResend() {
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
}

function afterTurn() {
  if (game.winner || game.draw) { clearTurnTimer(); return; }
  renderAbilities();
  showHint();
  if (mode === 'ai' && game.current === 2) {
    clearTurnTimer(); // la máquina no tiene reloj
    setTimeout(() => {
      if (game.winner || game.draw) return;
      const mv = chooseMove(game, 2, aiDifficulty);
      const ev = applyAndRender(mv);
      if (ev && ev.type !== 'bomb') afterTurn();
    }, 550);
  } else {
    startTurnTimer(); // turno humano: arranca el reloj
  }
}

// ===================================================================
//  Temporizador de turno (7 s)
// ===================================================================
function clearTurnTimer() {
  if (turnTimer) { clearInterval(turnTimer); turnTimer = null; }
  $('#timer').classList.add('hidden');
}

function timerShouldRun() {
  if (!game || game.winner || game.draw || busy) return false;
  if (!$('#help').classList.contains('hidden')) return false; // pausa con ayuda abierta
  if (mode === 'ai') return game.current === 1;
  if (mode === 'online') return game.current === myPlayer;
  if (mode === 'local') return true;
  return false;
}

function startTurnTimer() {
  clearTurnTimer();
  if (!timerShouldRun()) return;
  turnDeadline = Date.now() + TURN_SECONDS * 1000;
  const timerEl = $('#timer'), numEl = $('#timer-num');
  timerEl.classList.remove('hidden');
  const tick = () => {
    const left = Math.max(0, turnDeadline - Date.now());
    const secs = Math.ceil(left / 1000);
    numEl.textContent = secs;
    timerEl.classList.toggle('low', secs <= 3);
    if (left <= 0) { clearTurnTimer(); onTurnTimeout(); }
  };
  tick();
  turnTimer = setInterval(tick, 200);
}

function onTurnTimeout() {
  if (!canInteract()) return;
  const mv = randomAutoMove();
  log('juego', `⏱️ Se acabó el tiempo: jugada automática (${describeMove(mv)}).`);
  $('#hint').textContent = '⏱️ ¡Tiempo! Jugada automática.';
  localMove(mv);
}

// Una ficha normal en columna válida al azar; si no hay, cualquier jugada legal.
function randomAutoMove() {
  const cols = [];
  for (let c = 0; c < game.cols; c++) {
    if (!game.isColumnFrozenFor(c, game.current) && game.dropRow(c) >= 0) cols.push(c);
  }
  if (cols.length) return { type: 'normal', col: cols[Math.floor(Math.random() * cols.length)] };
  const all = game.legalMoves(game.current);
  return all[Math.floor(Math.random() * all.length)] || { type: 'normal', col: 0 };
}

// ===================================================================
//  Chat (modo online)
// ===================================================================
function appendChat(who, text, cls) {
  const list = $('#chat-list');
  const row = document.createElement('div');
  row.className = 'chat-msg ' + cls;
  const b = document.createElement('b');
  b.textContent = who + ': ';
  row.appendChild(b);
  row.appendChild(document.createTextNode(text)); // textContent: seguro contra inyección
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
}

function sendChat() {
  const inp = $('#chat-input');
  const text = inp.value.trim().slice(0, 300);
  if (!text || mode !== 'online' || !net) return;
  net.send({ type: 'chat', text });
  appendChat('Tú', text, 'chat-me');
  inp.value = '';
  log('red', 'Mensaje de chat enviado.');
}

function bumpChatBadge() {
  chatUnseen++;
  const b = $('#chat-badge');
  b.textContent = chatUnseen > 99 ? '99+' : String(chatUnseen);
  b.classList.remove('hidden');
}

function clearChat() {
  $('#chat-list').innerHTML = '';
  chatUnseen = 0;
  $('#chat-badge').classList.add('hidden');
  $('#chatpanel').classList.add('hidden');
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
  stopResend();
  clearTurnTimer();
  // Actualiza el marcador (cada cliente cuenta una vez, de forma consistente).
  if (ev.draw) score.draws++;
  else {
    const meIsPlayer = mode === 'local' ? 1 : myPlayer;
    if (ev.winner === meIsPlayer) score.me++; else score.opp++;
  }
  renderScore();
  log('juego', ev.draw ? '🤝 Empate — tablero lleno.' : `🏆 Fin: gana ${ev.winner === 1 ? 'Rojo' : 'Amarillo'}.`);
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
  resetSync();
  if (mode === 'ai') myPlayer = 1;
  if (mode === 'local') myPlayer = 1;
  buildBoard();
  syncBoard();
  updateHud();
  showHint();
  refreshTargetable();
  // El chat solo existe en online.
  $('#chat-btn').classList.toggle('hidden', mode !== 'online');
  clearChat();
  showScreen('game');
  startTurnTimer();
  log('juego', `Partida iniciada (modo: ${newMode}${mode === 'ai' ? ', dificultad ' + aiDifficulty : ''}${mode === 'online' ? ', eres ' + (myPlayer === 1 ? 'Rojo' : 'Amarillo') : ''}).`);
}

function resetGame() {
  game = new Connect5();
  selected = 'normal';
  busy = false;
  resetSync();
  buildBoard();
  syncBoard();
  updateHud();
  showHint();
  $('#endmodal').classList.add('hidden');
  if (mode === 'online') $('#net-status').textContent = `🟢 Conectado · eres ${myPlayer === 1 ? 'Rojo' : 'Amarillo'}`;
  startTurnTimer();
  log('juego', 'Partida reiniciada.');
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

  log('red', 'Creando sala como anfitrión…');
  net = new NetGame();
  setupNetHandlers();
  net.host().then((id) => {
    const url = `${location.origin}${location.pathname}?join=${id}`;
    $('#share-link').value = url;
    statusEl.textContent = '✅ Sala lista. Esperando al rival…';
    statusEl.style.color = '#2ee6c5';
    log('red', `Enlace de invitación generado (id ${id.slice(0, 8)}…).`);
  }).catch((err) => {
    log('error', `No se pudo crear la sala: ${peerErrMsg(err)}`);
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

  log('red', `Uniéndose a la sala (id ${hostId.slice(0, 8)}…) como invitado…`);
  net = new NetGame();
  setupNetHandlers();
  net.join(hostId);
}

// Reemplaza el estado local por el estado autoritativo recibido y anima.
function applyRemoteState(data) {
  lastAppliedSeq = data.seq;
  game = Connect5.fromState(data.state);
  const fx = data.fx;
  if (fx) {
    renderEffects(fx);
    playSfx(fx);
  }
  syncBoard({ winner: game.winner, winningCells: game.winningCells });
  updateHud();
  refreshTargetable();
  renderAbilities();
  showHint();
  log('juego', `Jugada del rival aplicada (turno #${game.moveCount}). ${fx ? describeFx(fx) : ''}`.trim());
  if (game.winner || game.draw) endGame({ winner: game.winner, draw: game.draw, winningCells: game.winningCells });
  else startTurnTimer(); // si ahora es mi turno, arranca el reloj
}

function describeFx(fx) {
  const names = { normal: 'ficha', bomb: '💣 bomba', block: '🧱 bloque', freeze: '🧊 congelar', swap: '🔄 cambio' };
  return names[fx.type] || '';
}

function setupNetHandlers() {
  const inLobby = () => !$('#lobby').classList.contains('hidden');

  net.onConnected = () => {
    myPlayer = net.myPlayer;
    $('#lobby').classList.add('hidden');
    log('red', `¡Conexión WebRTC establecida! Rol: ${net.role} (eres ${myPlayer === 1 ? 'Rojo' : 'Amarillo'}).`);
    startGame('online');
    $('#net-status').classList.remove('hidden');
    $('#net-status').textContent = `🟢 Conectado · eres ${myPlayer === 1 ? 'Rojo' : 'Amarillo'}`;
  };

  net.onMessage = (data) => {
    if (!data) return;

    if (data.type === 'ack') {
      // El rival confirmó mi último estado → dejo de reenviar.
      if (data.seq >= lastSentSeq) { stopResend(); log('red', `Ack recibido (seq ${data.seq})`); }
      return;
    }

    if (data.type === 'state') {
      // Confirmo recepción SIEMPRE (aunque sea duplicado).
      net.send({ type: 'ack', seq: data.seq });

      if (data.seq <= lastAppliedSeq) {
        log('red', `Estado duplicado/antiguo ignorado (seq ${data.seq})`);
        return;
      }
      if (data.seq > lastAppliedSeq + 1 && lastAppliedSeq > 0) {
        log('error', `Hueco en la secuencia: esperaba ${lastAppliedSeq + 1}, llegó ${data.seq}. Recuperado con estado completo.`);
      }

      // El rival avanzó → mi jugada anterior ya no necesita reenvío.
      if (data.seq >= lastSentSeq) stopResend();

      applyRemoteState(data);
      return;
    }

    if (data.type === 'chat') {
      const text = String(data.text || '').slice(0, 300);
      appendChat('Rival', text, 'chat-them');
      if ($('#chatpanel').classList.contains('hidden')) bumpChatBadge();
      log('red', 'Mensaje de chat recibido.');
      return;
    }

    if (data.type === 'restart') {
      log('juego', 'El rival reinició la partida.');
      resetGame();
    }
  };

  net.onStatus = (s, err) => {
    if (s === 'error') {
      const msg = peerErrMsg(err);
      log('error', `Estado de red: error — ${msg}`, err?.type || '');
      if (inLobby()) {
        lobbyError(msg);
      } else {
        stopResend();
        $('#net-status').textContent = '🔴 Error de conexión';
        $('#hint').textContent = '⚠️ ' + msg;
      }
    } else if (s === 'closed') {
      log('red', 'La conexión se cerró.');
      if (!inLobby()) {
        stopResend();
        $('#net-status').textContent = '🔴 Rival desconectado';
        $('#hint').textContent = 'La conexión se cerró. El rival cerró la pestaña o perdió internet.';
      }
    } else if (s === 'connecting') {
      log('red', 'Conectado al servidor de señalización, negociando WebRTC…');
      const el = $('#join-status');
      if (el) el.textContent = '🔄 Negociando conexión WebRTC…';
    } else if (s === 'peer-found') {
      log('red', 'Rival encontrado en el servidor, estableciendo canal de datos…');
      const el = $('#lobby-status');
      if (el) { el.textContent = '⚡ Rival encontrado, estableciendo conexión…'; el.style.color = '#ffd23b'; }
    } else if (s === 'waiting') {
      log('red', 'Sala creada en el servidor de señalización.');
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
  bindLogUI({ list: $('#log-list'), badge: $('#log-badge') });
  log('info', 'Connect 5 Dinámico iniciado.');

  // Menú
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.addEventListener('click', () => {
      unlock(); Sfx.click();
      const m = b.dataset.mode;
      score = { me: 0, opp: 0, draws: 0 }; // nuevo marcador al elegir modo
      if (m === 'online') openLobbyAsHost();
      else if (m === 'ai') {
        difmodalOpenedAt = Date.now();
        $('#difmodal').classList.remove('hidden');
      }
      else startGame(m);
    });
  });

  // Selección de dificultad
  document.querySelectorAll('.dif-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (Date.now() - difmodalOpenedAt < 350) return; // ignora ghost-click en móvil
      Sfx.click();
      aiDifficulty = b.dataset.dif;
      $('#difmodal').classList.add('hidden');
      startGame('ai');
    });
  });
  document.querySelector('.dif-cancel').onclick = () => $('#difmodal').classList.add('hidden');

  $('#how-btn').onclick = () => { clearTurnTimer(); $('#help').classList.remove('hidden'); };
  document.querySelector('.help-close').onclick = () => {
    $('#help').classList.add('hidden');
    startTurnTimer(); // reanuda el reloj al cerrar la ayuda
  };

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

  // Panel de registro de eventos
  $('#log-btn').onclick = () => {
    const p = $('#logpanel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) markSeen();
  };
  $('#log-close').onclick = () => $('#logpanel').classList.add('hidden');
  $('#log-copy').onclick = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(asText());
    $('#log-copy').textContent = '¡Copiado!';
    setTimeout(() => ($('#log-copy').textContent = 'Copiar'), 1500);
  };
  $('#log-download').onclick = () => downloadLog();
  $('#log-clear').onclick = () => clearLog();

  // Panel de chat (online)
  $('#chat-btn').onclick = () => {
    const p = $('#chatpanel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) {
      chatUnseen = 0; $('#chat-badge').classList.add('hidden');
      $('#chat-input').focus();
    }
  };
  $('#chat-close').onclick = () => $('#chatpanel').classList.add('hidden');
  $('#chat-send').onclick = () => sendChat();
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
  });

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
