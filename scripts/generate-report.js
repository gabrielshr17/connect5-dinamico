// Genera test-report.html a partir de test-results.json (salida del reporter json de Vitest).
// Ejecutar con: node scripts/generate-report.js
import { readFileSync, writeFileSync } from 'fs';

const raw = JSON.parse(readFileSync('./test-results.json', 'utf8'));

// ── Recolectar tests agrupados por describe ───────────────────────────────────
const suites = {};  // { 'applyMove()': { normal:[], limite:[], error:[] } }

for (const file of raw.testResults) {
  for (const t of file.assertionResults) {
    const suite = t.ancestorTitles[0] || 'Sin grupo';
    if (!suites[suite]) suites[suite] = { normal: [], limite: [], error: [] };

    const title = t.title;
    const ms    = t.duration != null ? `${t.duration}ms` : '—';
    const entry = { title, ms, status: t.status };

    if (title.startsWith('[normal]'))  suites[suite].normal.push(entry);
    else if (title.startsWith('[límite]')) suites[suite].limite.push(entry);
    else if (title.startsWith('[error]')) suites[suite].error.push(entry);
    else suites[suite].normal.push(entry);
  }
}

const totalTests  = raw.numTotalTests;
const totalPassed = raw.numPassedTests;
const totalFailed = raw.numFailedTests;
const date = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' });

// ── Descripciones de cada función ──────────────────────────────────────────────
const descriptions = {
  'applyMove()':      'Aplica una jugada al tablero: valida si es legal, coloca la ficha (o activa el efecto especial), cambia el turno y detecta victoria o empate.',
  'winningLineFor()': 'Determina si un jugador tiene 5 fichas consecutivas en alguna dirección: horizontal, vertical o diagonal. Es el árbitro final de la partida.',
};

// ── Limpia el prefijo de tipo del nombre del test ──────────────────────────────
function cleanName(title) {
  return title
    .replace(/^\[(normal|límite|error)\]\s*/i, '')
    .replace(/^./, c => c.toUpperCase());
}

// ── Renderiza una sección de tests (Normal / Límite / Error) ──────────────────
function renderSection(label, color, icon, tests) {
  if (!tests.length) return '';
  const items = tests.map(t => {
    const statusIcon = t.status === 'passed' ? '✅' : '❌';
    const rowClass   = t.status === 'passed' ? 'test-row' : 'test-row test-fail';
    return `
      <div class="${rowClass}">
        <span class="test-icon">${statusIcon}</span>
        <span class="test-name">${cleanName(t.title)}</span>
        <span class="test-ms">${t.ms}</span>
      </div>`;
  }).join('');

  return `
    <div class="section">
      <div class="section-label" style="color:${color}">
        <span class="section-icon">${icon}</span> ${label}
        <span class="section-count">${tests.length} prueba${tests.length !== 1 ? 's' : ''}</span>
      </div>
      ${items}
    </div>`;
}

// ── Renderiza cada card de función ────────────────────────────────────────────
function renderCard(suiteName, groups) {
  const total  = groups.normal.length + groups.limite.length + groups.error.length;
  const passed = [...groups.normal, ...groups.limite, ...groups.error].filter(t => t.status === 'passed').length;
  const allPass = passed === total;

  const sections =
    renderSection('Casos normales',  '#2b6cb0', '🟢', groups.normal) +
    renderSection('Casos límite',    '#b7791f', '🟡', groups.limite) +
    renderSection('Casos de error',  '#c53030', '🔴', groups.error);

  return `
  <div class="card">
    <div class="card-header">
      <div class="card-title-row">
        <span class="card-fn">${suiteName}</span>
        <span class="card-badge ${allPass ? 'badge-pass' : 'badge-fail'}">
          ${allPass ? '✅' : '❌'} ${passed}/${total} pasaron
        </span>
      </div>
      <p class="card-desc">${descriptions[suiteName] || ''}</p>
    </div>
    ${sections}
  </div>`;
}

// ── HTML completo ──────────────────────────────────────────────────────────────
const cards = Object.entries(suites).map(([name, groups]) => renderCard(name, groups)).join('\n');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reporte de Tests — Connect 5 Dinámico</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f7f8fc;
      color: #1a202c;
      min-height: 100vh;
      padding: 2.5rem 1.5rem 4rem;
    }

    /* ── Header ─────────────────────────────── */
    header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .header-title {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #1a202c;
    }
    .header-sub {
      margin-top: 0.35rem;
      font-size: 0.875rem;
      color: #718096;
    }
    .summary-bar {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1.25rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 9999px;
      padding: 0.5rem 1.25rem;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
    }
    .sum-item {
      font-size: 0.85rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .sum-pass  { color: #276749; }
    .sum-total { color: #4a5568; }
    .sum-div   { width: 1px; height: 1.1rem; background: #e2e8f0; }

    /* ── Cards grid ──────────────────────────── */
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 1.5rem;
      max-width: 1100px;
      margin: 0 auto;
    }
    .card {
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,.07);
      overflow: hidden;
      border: 1px solid #e8edf2;
    }

    /* ── Card header ─────────────────────────── */
    .card-header {
      padding: 1.25rem 1.5rem 1.1rem;
      background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
      color: white;
    }
    .card-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .card-fn {
      font-family: 'SFMono-Regular', Consolas, monospace;
      font-size: 1.05rem;
      font-weight: 700;
      color: #90cdf4;
    }
    .card-badge {
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      white-space: nowrap;
    }
    .badge-pass { background: #276749; color: #c6f6d5; }
    .badge-fail { background: #c53030; color: #fff5f5; }
    .card-desc {
      margin-top: 0.6rem;
      font-size: 0.82rem;
      color: #a0aec0;
      line-height: 1.55;
    }

    /* ── Sections ────────────────────────────── */
    .section {
      padding: 1rem 1.5rem 0.75rem;
    }
    .section + .section {
      border-top: 1px solid #f0f4f8;
    }
    .section-label {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 0.6rem;
    }
    .section-icon { font-size: 0.7rem; }
    .section-count {
      margin-left: auto;
      font-size: 0.68rem;
      font-weight: 600;
      color: #a0aec0;
      text-transform: none;
      letter-spacing: 0;
    }

    /* ── Test rows ───────────────────────────── */
    .test-row {
      display: flex;
      align-items: baseline;
      gap: 0.55rem;
      padding: 0.28rem 0;
    }
    .test-row + .test-row {
      border-top: 1px dashed #f0f4f8;
    }
    .test-fail .test-name { color: #c53030; }
    .test-icon { font-size: 0.8rem; flex-shrink: 0; }
    .test-name {
      font-size: 0.855rem;
      color: #4a5568;
      line-height: 1.45;
      flex: 1;
    }
    .test-ms {
      font-size: 0.72rem;
      color: #cbd5e0;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* ── Legend ──────────────────────────────── */
    .legend {
      max-width: 1100px;
      margin: 1.75rem auto 0;
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.78rem;
      color: #718096;
    }
    .legend-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ── Footer ──────────────────────────────── */
    footer {
      text-align: center;
      margin-top: 2.5rem;
      font-size: 0.75rem;
      color: #a0aec0;
    }

    @media (max-width: 600px) {
      .cards { grid-template-columns: 1fr; }
      .header-title { font-size: 1.35rem; }
    }
  </style>
</head>
<body>

  <header>
    <div class="header-title">Connect 5 Dinámico — Reporte de Tests</div>
    <div class="header-sub">Funciones críticas del motor de juego · ${date}</div>
    <div class="summary-bar">
      <span class="sum-item sum-pass">✅ ${totalPassed} pruebas pasaron</span>
      <span class="sum-div"></span>
      <span class="sum-item sum-total">📋 ${totalTests} en total</span>
      ${totalFailed > 0 ? `<span class="sum-div"></span><span class="sum-item" style="color:#c53030">❌ ${totalFailed} fallaron</span>` : ''}
    </div>
  </header>

  <div class="cards">
    ${cards}
  </div>

  <div class="legend">
    <span class="legend-item"><span class="legend-dot" style="background:#2b6cb0"></span><b>Casos normales</b> — el flujo esperado del juego</span>
    <span class="legend-item"><span class="legend-dot" style="background:#b7791f"></span><b>Casos límite</b> — bordes del tablero, inventario al mínimo, empate</span>
    <span class="legend-item"><span class="legend-dot" style="background:#c53030"></span><b>Casos de error</b> — movimientos ilegales, partida terminada, entradas inválidas</span>
  </div>

  <footer>Generado con Vitest · Connect 5 Dinámico</footer>

</body>
</html>`;

writeFileSync('./test-report.html', html, 'utf8');
console.log(`\n✅ Reporte generado: test-report.html (${totalPassed}/${totalTests} tests en verde)\n`);
