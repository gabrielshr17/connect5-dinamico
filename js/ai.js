// ===================================================================
//  IA para Connect 5 Dinámico.
//  Heurística de líneas + uso táctico de habilidades.
// ===================================================================

// Evalúa el tablero desde el punto de vista de 'player'.
function evaluate(game, player) {
  const opp = player === 1 ? 2 : 1;
  const { board, rows, cols, need } = game;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let score = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of dirs) {
        const er = r + dr * (need - 1);
        const ec = c + dc * (need - 1);
        if (er < 0 || er >= rows || ec < 0 || ec >= cols) continue;
        let mine = 0, theirs = 0;
        for (let k = 0; k < need; k++) {
          const v = board[r + dr * k][c + dc * k];
          if (v === player) mine++;
          else if (v === opp) theirs++;
        }
        if (mine > 0 && theirs > 0) continue; // ventana bloqueada
        if (mine > 0) score += weight(mine);
        else if (theirs > 0) score -= weight(theirs) * 1.1; // priorizar defensa
      }
    }
  }
  return score;
}

function weight(count) {
  return [0, 1, 10, 60, 350, 100000][count] || 0;
}

// Devuelve un movimiento ganador inmediato para 'player', o null.
function findWinningMove(game, player) {
  for (const mv of game.legalMoves(player)) {
    if (mv.type === 'freeze') continue; // freeze nunca gana directamente
    const g = game.clone();
    g.current = player;
    const ev = g.applyMove(mv);
    if (ev.ok && ev.winner === player) return mv;
  }
  return null;
}

// Devuelve la columna donde el rival ganaría con una ficha normal, o -1.
function findOpponentThreatColumn(game, opp) {
  for (let c = 0; c < game.cols; c++) {
    if (game.dropRow(c) < 0) continue;
    const g = game.clone();
    g.current = opp;
    const ev = g.applyMove({ type: 'normal', col: c });
    if (ev.ok && ev.winner === opp) return c;
  }
  return -1;
}

export function chooseMove(game, player) {
  const opp = player === 1 ? 2 : 1;

  // 1. ¿Puedo ganar ya? (normal, bomba, bloque o swap)
  const win = findWinningMove(game, player);
  if (win) return win;

  // 2. ¿El rival gana en su próximo turno? Defender.
  const threat = findOpponentThreatColumn(game, opp);
  if (threat >= 0 && !game.isColumnFrozenFor(threat, player)) {
    // Si tengo congelación, bloquear esa columna es muy fuerte.
    if (game.inventory[player].freeze > 0 && Math.random() < 0.6) {
      return { type: 'freeze', col: threat };
    }
    // Si tengo bomba y hay ficha rival adyacente que romper, usar bomba.
    if (game.inventory[player].bomb > 0 && game.dropRow(threat) >= 0 && Math.random() < 0.5) {
      return { type: 'bomb', col: threat };
    }
    // Bloqueo simple colocando una ficha normal encima.
    if (game.dropRow(threat) >= 0) return { type: 'normal', col: threat };
  }

  // 3. Swap oportunista: robar una ficha rival si mejora mucho mi posición.
  if (game.inventory[player].swap > 0) {
    let best = null, bestGain = 30; // umbral mínimo de ganancia
    const base = evaluate(game, player);
    for (let r = 0; r < game.rows; r++) {
      for (let c = 0; c < game.cols; c++) {
        if (game.board[r][c] === opp) {
          const g = game.clone();
          g.current = player;
          const ev = g.applyMove({ type: 'swap', target: { r, c } });
          if (!ev.ok) continue;
          const gain = evaluate(g, player) - base;
          if (gain > bestGain) { bestGain = gain; best = { type: 'swap', target: { r, c } }; }
        }
      }
    }
    if (best) return best;
  }

  // 4. Heurística general sobre fichas normales (y bloque ocasional).
  let bestMove = null, bestScore = -Infinity;
  const candidates = [];
  for (let c = 0; c < game.cols; c++) {
    if (game.isColumnFrozenFor(c, player)) continue;
    if (game.dropRow(c) >= 0) candidates.push({ type: 'normal', col: c });
  }
  if (game.inventory[player].block > 0) {
    for (let c = 0; c < game.cols; c++) {
      if (game.isColumnFrozenFor(c, player)) continue;
      const r1 = game.dropRow(c);
      if (r1 >= 0 && r1 + 1 < game.rows) candidates.push({ type: 'block', col: c });
    }
  }

  for (const mv of candidates) {
    const g = game.clone();
    g.current = player;
    const ev = g.applyMove(mv);
    if (!ev.ok) continue;
    let s = evaluate(g, player);
    if (mv.type === 'block') s -= 12; // ligero coste por gastar la habilidad
    s += (Math.random() - 0.5) * 4;   // algo de variedad
    if (s > bestScore) { bestScore = s; bestMove = mv; }
  }

  return bestMove || { type: 'normal', col: Math.floor(game.cols / 2) };
}
