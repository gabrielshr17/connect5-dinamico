import { describe, it, expect, beforeEach } from 'vitest';
import { Connect5 } from '../js/game.js';

// ─── winningLineFor() ─────────────────────────────────────────────────────────
// Determina si existe una línea ganadora de 5 fichas del jugador dado.
// Busca en 4 direcciones: horizontal, vertical, diagonal /, diagonal \.
// Es la función árbitro del juego: si falla, el juego nunca termina
// (o termina cuando no debería).
// ─────────────────────────────────────────────────────────────────────────────

describe('winningLineFor()', () => {
  let g;
  beforeEach(() => { g = new Connect5(); });

  // ── Casos normales ──────────────────────────────────────────────────────────

  it('[normal] tablero vacío → null para ambos jugadores', () => {
    expect(g.winningLineFor(1)).toBeNull();
    expect(g.winningLineFor(2)).toBeNull();
  });

  it('[normal] detecta 5 en horizontal', () => {
    for (let c = 0; c < 5; c++) g.board[0][c] = 1;
    const line = g.winningLineFor(1);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
    line.forEach(cell => expect(cell.r).toBe(0));
  });

  it('[normal] detecta 5 en vertical', () => {
    for (let r = 0; r < 5; r++) g.board[r][3] = 2;
    const line = g.winningLineFor(2);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
    line.forEach(cell => expect(cell.c).toBe(3));
  });

  it('[normal] detecta 5 en diagonal ascendente (/)', () => {
    for (let i = 0; i < 5; i++) g.board[i][i] = 1;
    const line = g.winningLineFor(1);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('[normal] detecta 5 en diagonal descendente (\\)', () => {
    for (let i = 0; i < 5; i++) g.board[4 - i][i] = 2;
    const line = g.winningLineFor(2);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('[normal] devuelve exactamente las 5 celdas ganadoras', () => {
    for (let c = 2; c < 7; c++) g.board[3][c] = 1;
    const line = g.winningLineFor(1);
    expect(line).toHaveLength(5);
    const cols = line.map(cell => cell.c).sort((a, b) => a - b);
    expect(cols).toEqual([2, 3, 4, 5, 6]);
  });

  it('[normal] no confunde fichas de P1 con las de P2', () => {
    for (let c = 0; c < 5; c++) g.board[0][c] = 1;
    expect(g.winningLineFor(1)).not.toBeNull();
    expect(g.winningLineFor(2)).toBeNull();
  });

  // ── Casos límite ────────────────────────────────────────────────────────────

  it('[límite] 4 en línea no es ganador', () => {
    for (let c = 0; c < 4; c++) g.board[0][c] = 1;
    expect(g.winningLineFor(1)).toBeNull();
  });

  it('[límite] 6 en línea sí es ganador (devuelve las primeras 5)', () => {
    for (let c = 0; c < 6; c++) g.board[0][c] = 1;
    const line = g.winningLineFor(1);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('[límite] 5 en horizontal pegados al borde derecho del tablero', () => {
    for (let c = 5; c < 10; c++) g.board[0][c] = 2;
    const line = g.winningLineFor(2);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('[límite] 5 en vertical en la fila superior del tablero', () => {
    for (let r = 3; r < 8; r++) g.board[r][0] = 1;
    const line = g.winningLineFor(1);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('[límite] diagonal en la esquina superior derecha del tablero', () => {
    // diagonal \ desde (3,5) hasta (7,9)
    for (let i = 0; i < 5; i++) g.board[3 + i][5 + i] = 1;
    const line = g.winningLineFor(1);
    expect(line).not.toBeNull();
    expect(line).toHaveLength(5);
  });

  it('[límite] línea interrumpida por ficha rival → null', () => {
    // P1 en cols 0,1,2,4,5 — col 3 es del P2 (rompe la secuencia)
    g.board[0][0] = 1;
    g.board[0][1] = 1;
    g.board[0][2] = 1;
    g.board[0][3] = 2; // interrupción
    g.board[0][4] = 1;
    g.board[0][5] = 1;
    expect(g.winningLineFor(1)).toBeNull();
  });

  // ── Casos de error ──────────────────────────────────────────────────────────

  it('[error] tablero lleno en patrón de pares sin 5 en línea → null para ambos', () => {
    // Patrón de grupos de 2 columnas alternando por fila:
    // max 2 consecutivos en cualquier dirección → ningún jugador gana.
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 10; c++)
        g.board[r][c] = (Math.floor(c / 2) + r) % 2 === 0 ? 1 : 2;
    expect(g.winningLineFor(1)).toBeNull();
    expect(g.winningLineFor(2)).toBeNull();
  });

  it('[error] jugador inexistente no lanza excepción', () => {
    // La función busca el valor literal en el tablero; no valida que el jugador sea 1 ó 2.
    // Con el tablero casi vacío hay celdas con valor 0 que podrían formar líneas.
    // Lo esencial es que nunca lanza una excepción.
    expect(() => g.winningLineFor(0)).not.toThrow();
    const result = g.winningLineFor(0);
    expect(result === null || Array.isArray(result)).toBe(true);
  });

  it('[error] clone preserva la detección de victoria', () => {
    for (let c = 0; c < 5; c++) g.board[0][c] = 1;
    const clone = g.clone();
    expect(clone.winningLineFor(1)).not.toBeNull();
    expect(clone.winningLineFor(1)).toHaveLength(5);
  });

  it('[error] fromState reconstruye y detecta victoria correctamente', () => {
    for (let c = 0; c < 5; c++) g.board[0][c] = 2;
    const state = g.toState();
    const restored = Connect5.fromState(state);
    expect(restored.winningLineFor(2)).not.toBeNull();
    expect(restored.winningLineFor(1)).toBeNull();
  });
});
