// ===================================================================
//  Registro de eventos del juego.
//  Muestra en un panel y permite copiar/descargar para depurar fallos.
// ===================================================================

const MAX = 600;
const entries = [];
let listEl = null;
let badgeEl = null;
let unseen = 0;

// cat: 'red' (rojo/azul = conexión), 'juego', 'error', 'info'
export function log(cat, msg, data) {
  const ts = new Date();
  const t = ts.toTimeString().slice(0, 8) + '.' + String(ts.getMilliseconds()).padStart(3, '0');
  const entry = { t, cat, msg, data };
  entries.push(entry);
  if (entries.length > MAX) entries.shift();

  // Espejo en la consola del navegador.
  const tag = `[${t}] [${cat}]`;
  if (cat === 'error') console.error(tag, msg, data ?? '');
  else console.log(tag, msg, data ?? '');

  renderEntry(entry);
}

export function bindLogUI({ list, badge }) {
  listEl = list;
  badgeEl = badge;
  // Pintar lo acumulado antes del bind (por si hubo logs tempranos).
  if (listEl) { listEl.innerHTML = ''; entries.forEach(renderEntry); }
}

function renderEntry(entry) {
  if (!listEl) { unseen++; updateBadge(); return; }
  const div = document.createElement('div');
  div.className = 'log-row log-' + entry.cat;
  const extra = entry.data !== undefined ? '  ' + safe(entry.data) : '';
  div.textContent = `${entry.t}  ${icon(entry.cat)} ${entry.msg}${extra}`;
  listEl.appendChild(div);
  listEl.scrollTop = listEl.scrollHeight;
  if (listEl.closest('.hidden')) { unseen++; updateBadge(); }
}

function icon(cat) {
  return { red: '🌐', juego: '🎮', error: '⛔', info: 'ℹ️' }[cat] || '•';
}

function safe(d) {
  try { return typeof d === 'string' ? d : JSON.stringify(d); }
  catch (e) { return String(d); }
}

function updateBadge() {
  if (!badgeEl) return;
  if (unseen > 0) { badgeEl.textContent = unseen > 99 ? '99+' : String(unseen); badgeEl.classList.remove('hidden'); }
  else badgeEl.classList.add('hidden');
}

export function markSeen() { unseen = 0; updateBadge(); }

export function asText() {
  return entries.map((e) => `[${e.t}] [${e.cat}] ${e.msg}${e.data !== undefined ? '  ' + safe(e.data) : ''}`).join('\n');
}

export function clearLog() {
  entries.length = 0;
  if (listEl) listEl.innerHTML = '';
  unseen = 0; updateBadge();
}

export function downloadLog() {
  const blob = new Blob([asText()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `connect5-log-${Date.now()}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
