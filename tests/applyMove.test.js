import { describe, it, expect, beforeEach } from 'vitest';
import { Connect5, COLS, ROWS } from '../js/game.js';

// ─── applyMove() ─────────────────────────────────────────────────────────────
// Función más crítica del motor: valida, aplica y resuelve cada jugada.
// Cubre: ficha normal, bomba, bloque, congelar, cambio de color.
// ─────────────────────────────────────────────────────────────────────────────

describe('applyMove()', () => {
  let g;
  beforeEach(() => { g = new Connect5(); });

  // ── Casos normales ──────────────────────────────────────────────────────────

  it('[normal] coloca la ficha en la fila más baja libre', () => {
    const ev = g.applyMove({ type: 'normal', col: 0 });
    expect(ev.ok).toBe(true);
    expect(ev.placed).toEqual([{ r: 0, c: 0 }]);
    expect(g.board[0][0]).toBe(1);
  });

  it('[normal] el turno pasa al oponente tras la jugada', () => {
    expect(g.current).toBe(1);
    g.applyMove({ type: 'normal', col: 0 });
    expect(g.current).toBe(2);
    g.applyMove({ type: 'normal', col: 1 });
    expect(g.current).toBe(1);
  });

  it('[normal] moveCount se incrementa con cada jugada', () => {
    expect(g.moveCount).toBe(0);
    g.applyMove({ type: 'normal', col: 0 });
    expect(g.moveCount).toBe(1);
    g.applyMove({ type: 'normal', col: 1 });
    expect(g.moveCount).toBe(2);
  });

  it('[normal] las fichas se apilan correctamente en la misma columna', () => {
    g.applyMove({ type: 'normal', col: 3 }); // P1 → r=0
    g.applyMove({ type: 'normal', col: 3 }); // P2 → r=1
    g.applyMove({ type: 'normal', col: 3 }); // P1 → r=2
    expect(g.board[0][3]).toBe(1);
    expect(g.board[1][3]).toBe(2);
    expect(g.board[2][3]).toBe(1);
  });

  it('[bomba] elimina las fichas adyacentes y aplica gravedad', () => {
    // Colocar fichas en col 5 para que la bomba las elimine
    g.applyMove({ type: 'normal', col: 5 }); // P1 r=0
    g.applyMove({ type: 'normal', col: 5 }); // P2 r=1
    g.applyMove({ type: 'normal', col: 5 }); // P1 r=2
    // P2 usa bomba en col 5
    const ev = g.applyMove({ type: 'bomb', col: 5 });
    expect(ev.ok).toBe(true);
    expect(ev.type).toBe('bomb');
    expect(ev.removed.length).toBeGreaterThan(0);
    expect(g.inventory[2].bomb).toBe(1); // consumió 1 bomba
  });

  it('[bloque] coloca 2 fichas en una sola jugada', () => {
    const ev = g.applyMove({ type: 'block', col: 4 });
    expect(ev.ok).toBe(true);
    expect(ev.placed.length).toBe(2);
    expect(g.board[0][4]).toBe(1);
    expect(g.board[1][4]).toBe(1);
    expect(g.inventory[1].block).toBe(1); // consumió 1 bloque
  });

  it('[congelar] bloquea una columna para el rival durante 3 turnos', () => {
    const ev = g.applyMove({ type: 'freeze', col: 2 });
    expect(ev.ok).toBe(true);
    expect(g.frozen).toHaveLength(1);
    expect(g.frozen[0]).toMatchObject({ col: 2, target: 2, turns: 3 });
    expect(g.inventory[1].freeze).toBe(1);
  });

  it('[congelar] el contador baja 1 por cada turno del rival', () => {
    g.applyMove({ type: 'freeze', col: 2 }); // P1 congela col 2 para P2
    // P2 juega (turno del target → turns baja de 3 a 2)
    g.applyMove({ type: 'normal', col: 0 });
    expect(g.frozen[0].turns).toBe(2);
    // P1 juega (turno de P1, no afecta)
    g.applyMove({ type: 'normal', col: 1 });
    expect(g.frozen[0].turns).toBe(2);
    // P2 juega de nuevo → turns 1
    g.applyMove({ type: 'normal', col: 3 });
    expect(g.frozen[0].turns).toBe(1);
    // P1 juega → sin cambio
    g.applyMove({ type: 'normal', col: 4 });
    expect(g.frozen[0].turns).toBe(1);
    // P2 juega → turns 0 → se elimina
    g.applyMove({ type: 'normal', col: 6 });
    expect(g.frozen).toHaveLength(0);
  });

  it('[cambio] convierte una ficha del rival en propia', () => {
    g.applyMove({ type: 'normal', col: 0 }); // P1 en r=0,c=0
    const ev = g.applyMove({ type: 'swap', target: { r: 0, c: 0 } });
    expect(ev.ok).toBe(true);
    expect(g.board[0][0]).toBe(2); // ahora es del P2
    expect(g.inventory[2].swap).toBe(1);
  });

  // ── Casos límite ────────────────────────────────────────────────────────────

  it('[límite] detecta victoria horizontal exactamente en 5', () => {
    // P1 conecta cols 0-4 en fila 0
    for (let c = 0; c < 4; c++) {
      g.applyMove({ type: 'normal', col: c });       // P1
      g.applyMove({ type: 'normal', col: c + 5 });   // P2 (columnas lejanas)
    }
    const ev = g.applyMove({ type: 'normal', col: 4 }); // P1 conecta 5
    expect(ev.winner).toBe(1);
    expect(ev.winningCells).toHaveLength(5);
  });

  it('[límite] bloque ilegal si sólo queda 1 hueco en la columna', () => {
    // Llenar la columna 0 dejando 1 hueco (7 fichas en 8 filas)
    for (let i = 0; i < 7; i++) {
      const player = i % 2 === 0 ? 1 : 2;
      g.board[i][0] = player;
    }
    g.current = 1;
    const ev = g.applyMove({ type: 'block', col: 0 });
    expect(ev.ok).toBe(false);
  });

  it('[límite] bloque legal si quedan exactamente 2 huecos', () => {
    for (let i = 0; i < 6; i++) {
      g.board[i][0] = (i % 2) + 1;
    }
    g.current = 1;
    const ev = g.applyMove({ type: 'block', col: 0 });
    expect(ev.ok).toBe(true);
    expect(g.board[6][0]).toBe(1);
    expect(g.board[7][0]).toBe(1);
  });

  it('[límite] bomba en columna 0 no accede a índices negativos', () => {
    g.applyMove({ type: 'normal', col: 0 }); // P1
    g.applyMove({ type: 'normal', col: 0 }); // P2
    const ev = g.applyMove({ type: 'bomb', col: 0 }); // P1 bomba en borde izquierdo
    expect(ev.ok).toBe(true);
    // No debe haber excepción y el tablero sigue siendo válido
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        expect([0, 1, 2]).toContain(g.board[r][c]);
      }
    }
  });

  it('[límite] columna congelada impide ficha normal del rival', () => {
    g.applyMove({ type: 'freeze', col: 3 }); // P1 congela col 3 para P2
    const ev = g.applyMove({ type: 'normal', col: 3 }); // P2 intenta jugar en col 3
    expect(ev.ok).toBe(false);
  });

  it('[límite] empate cuando el tablero se llena sin ganador', () => {
    // Patrón en pares de columnas alternando por fila: grupos de 2
    // → máximo 2 consecutivos horizontal/vertical/diagonal, nunca 5.
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        g.board[r][c] = (Math.floor(c / 2) + r) % 2 === 0 ? 1 : 2;
    // Vaciar la celda (0,0) — que el patrón asigna a P1 — para que P1 la rellene.
    g.board[0][0] = 0;
    g.current = 1;
    const ev = g.applyMove({ type: 'normal', col: 0 });
    expect(ev.draw).toBe(true);
    expect(ev.winner).toBe(0);
  });

  // ── Casos de error ──────────────────────────────────────────────────────────

  it('[error] jugada en columna llena devuelve ok:false', () => {
    for (let r = 0; r < ROWS; r++) g.board[r][0] = 1;
    const ev = g.applyMove({ type: 'normal', col: 0 });
    expect(ev.ok).toBe(false);
  });

  it('[error] no se puede jugar una vez hay ganador', () => {
    g.winner = 1;
    const ev = g.applyMove({ type: 'normal', col: 0 });
    expect(ev.ok).toBe(false);
  });

  it('[error] no se puede jugar en empate', () => {
    g.draw = true;
    const ev = g.applyMove({ type: 'normal', col: 0 });
    expect(ev.ok).toBe(false);
  });

  it('[error] tipo de movimiento desconocido devuelve ok:false', () => {
    const ev = g.applyMove({ type: 'teleport', col: 0 });
    expect(ev.ok).toBe(false);
  });

  it('[error] swap sobre celda vacía devuelve ok:false', () => {
    const ev = g.applyMove({ type: 'swap', target: { r: 0, c: 0 } });
    expect(ev.ok).toBe(false);
  });

  it('[error] swap sobre ficha propia devuelve ok:false', () => {
    g.board[0][0] = 1; // ficha del propio P1
    const ev = g.applyMove({ type: 'swap', target: { r: 0, c: 0 } });
    expect(ev.ok).toBe(false);
  });

  it('[error] usar bomba sin inventario devuelve ok:false', () => {
    g.inventory[1].bomb = 0;
    const ev = g.applyMove({ type: 'bomb', col: 0 });
    expect(ev.ok).toBe(false);
  });

  it('[error] congelar sin inventario devuelve ok:false', () => {
    g.inventory[1].freeze = 0;
    const ev = g.applyMove({ type: 'freeze', col: 0 });
    expect(ev.ok).toBe(false);
  });
});
