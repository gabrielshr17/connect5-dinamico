// ===================================================================
//  Connect 5 Dinámico — Lógica del juego (pura, sin DOM)
//  Reutilizable por la IA, el modo online y los tests.
// ===================================================================

export const COLS = 10;
export const ROWS = 8;
export const NEED = 5;

// Inventario inicial de fichas con habilidades por jugador.
export const DEFAULT_INVENTORY = { bomb: 2, block: 2, freeze: 2, swap: 2 };

export const ABILITIES = ['normal', 'bomb', 'block', 'freeze', 'swap'];

export class Connect5 {
  constructor(opts = {}) {
    this.cols = opts.cols || COLS;
    this.rows = opts.rows || ROWS;
    this.need = opts.need || NEED;
    // board[r][c]: 0 vacío, 1 jugador rojo, 2 jugador amarillo. r=0 es la fila de abajo.
    this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    this.current = 1;
    this.inventory = {
      1: { ...DEFAULT_INVENTORY },
      2: { ...DEFAULT_INVENTORY },
    };
    this.frozen = [];        // [{ col, target }] columnas bloqueadas para 'target'
    this.winner = 0;
    this.winningCells = [];
    this.draw = false;
    this.moveCount = 0;
  }

  clone() {
    const g = new Connect5({ cols: this.cols, rows: this.rows, need: this.need });
    g.board = this.board.map((row) => row.slice());
    g.current = this.current;
    g.inventory = {
      1: { ...this.inventory[1] },
      2: { ...this.inventory[2] },
    };
    g.frozen = this.frozen.map((f) => ({ ...f }));
    g.winner = this.winner;
    g.winningCells = this.winningCells.map((c) => ({ ...c }));
    g.draw = this.draw;
    g.moveCount = this.moveCount;
    return g;
  }

  // Serializa el estado completo para enviarlo por la red.
  toState() {
    return {
      cols: this.cols, rows: this.rows, need: this.need,
      board: this.board.map((row) => row.slice()),
      current: this.current,
      inventory: { 1: { ...this.inventory[1] }, 2: { ...this.inventory[2] } },
      frozen: this.frozen.map((f) => ({ ...f })),
      winner: this.winner,
      winningCells: this.winningCells.map((c) => ({ ...c })),
      draw: this.draw,
      moveCount: this.moveCount,
    };
  }

  // Reconstruye una instancia a partir de un estado serializado.
  static fromState(s) {
    const g = new Connect5({ cols: s.cols, rows: s.rows, need: s.need });
    g.board = s.board.map((row) => row.slice());
    g.current = s.current;
    g.inventory = { 1: { ...s.inventory[1] }, 2: { ...s.inventory[2] } };
    g.frozen = (s.frozen || []).map((f) => ({ ...f, turns: f.turns ?? 1 }));
    g.winner = s.winner;
    g.winningCells = (s.winningCells || []).map((c) => ({ ...c }));
    g.draw = s.draw;
    g.moveCount = s.moveCount;
    return g;
  }

  opponent(p = this.current) {
    return p === 1 ? 2 : 1;
  }

  // Fila más baja libre de una columna, o -1 si está llena.
  dropRow(col) {
    if (col < 0 || col >= this.cols) return -1;
    for (let r = 0; r < this.rows; r++) {
      if (this.board[r][col] === 0) return r;
    }
    return -1;
  }

  isColumnFrozenFor(col, player) {
    return this.frozen.some((f) => f.col === col && f.target === player);
  }

  isFull() {
    return this.board[this.rows - 1].every((cell) => cell !== 0);
  }

  // Aplica gravedad a una columna: compacta las fichas hacia abajo.
  _applyGravity() {
    for (let c = 0; c < this.cols; c++) {
      const stack = [];
      for (let r = 0; r < this.rows; r++) {
        if (this.board[r][c] !== 0) stack.push(this.board[r][c]);
      }
      for (let r = 0; r < this.rows; r++) {
        this.board[r][c] = r < stack.length ? stack[r] : 0;
      }
    }
  }

  // ¿Existe una línea de 'need' del jugador 'p'? Devuelve celdas o null.
  winningLineFor(p) {
    const dirs = [
      [1, 0],   // vertical
      [0, 1],   // horizontal
      [1, 1],   // diagonal /
      [1, -1],  // diagonal \
    ];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c] !== p) continue;
        for (const [dr, dc] of dirs) {
          const cells = [{ r, c }];
          let rr = r + dr, cc = c + dc;
          while (
            rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols &&
            this.board[rr][cc] === p
          ) {
            cells.push({ r: rr, c: cc });
            if (cells.length >= this.need) return cells.slice(0, this.need);
            rr += dr; cc += dc;
          }
        }
      }
    }
    return null;
  }

  _checkEnd() {
    // El jugador que acaba de mover tiene prioridad en empates de victoria.
    const mover = this.current;
    const other = this.opponent(mover);
    const wMover = this.winningLineFor(mover);
    if (wMover) {
      this.winner = mover;
      this.winningCells = wMover;
      return;
    }
    const wOther = this.winningLineFor(other);
    if (wOther) {
      this.winner = other;
      this.winningCells = wOther;
      return;
    }
    if (this.isFull()) this.draw = true;
  }

  // ¿Es legal este movimiento para el jugador actual?
  isLegal(move) {
    if (this.winner || this.draw) return false;
    const p = this.current;
    const inv = this.inventory[p];

    if (move.type !== 'normal') {
      if (!inv[move.type] || inv[move.type] <= 0) return false;
    }

    switch (move.type) {
      case 'normal':
      case 'bomb':
        if (this.isColumnFrozenFor(move.col, p)) return false;
        return this.dropRow(move.col) >= 0;
      case 'block': {
        if (this.isColumnFrozenFor(move.col, p)) return false;
        const r1 = this.dropRow(move.col);
        return r1 >= 0 && r1 + 1 < this.rows;
      }
      case 'freeze':
        if (move.col < 0 || move.col >= this.cols) return false;
        return true;
      case 'swap': {
        const { r, c } = move.target || {};
        if (r == null || c == null) return false;
        return this.board[r] && this.board[r][c] === this.opponent(p);
      }
      default:
        return false;
    }
  }

  // Aplica un movimiento. Devuelve un objeto de eventos para animaciones,
  // o { ok:false } si el movimiento es ilegal.
  applyMove(move) {
    if (!this.isLegal(move)) return { ok: false };
    const p = this.current;
    const events = { ok: true, type: move.type, placed: [], removed: [], swap: null, freezeCol: null, player: p };

    switch (move.type) {
      case 'normal': {
        const r = this.dropRow(move.col);
        this.board[r][move.col] = p;
        events.placed.push({ r, c: move.col });
        break;
      }
      case 'bomb': {
        const r = this.dropRow(move.col);
        this.board[r][move.col] = p; // aterriza
        events.center = { r, c: move.col };
        // Explota: elimina las 8 adyacentes + la propia.
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = move.col + dc;
            if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols && this.board[rr][cc] !== 0) {
              events.removed.push({ r: rr, c: cc });
              this.board[rr][cc] = 0;
            }
          }
        }
        this.inventory[p].bomb--;
        this._applyGravity();
        break;
      }
      case 'block': {
        const r1 = this.dropRow(move.col);
        this.board[r1][move.col] = p;
        const r2 = this.dropRow(move.col);
        this.board[r2][move.col] = p;
        events.placed.push({ r: r1, c: move.col }, { r: r2, c: move.col });
        this.inventory[p].block--;
        break;
      }
      case 'freeze': {
        // Bloquea la columna para el rival durante sus próximos 3 turnos.
        this.frozen.push({ col: move.col, target: this.opponent(p), turns: 3 });
        events.freezeCol = move.col;
        this.inventory[p].freeze--;
        break;
      }
      case 'swap': {
        const { r, c } = move.target;
        this.board[r][c] = p;
        events.swap = { r, c };
        this.inventory[p].swap--;
        break;
      }
    }

    this.moveCount++;
    // Las congelaciones que afectaban al jugador actual gastan un turno; se
    // eliminan cuando llegan a 0.
    this.frozen = this.frozen
      .map((f) => (f.target === p ? { ...f, turns: f.turns - 1 } : f))
      .filter((f) => f.turns > 0);

    this._checkEnd();
    events.winner = this.winner;
    events.winningCells = this.winningCells;
    events.draw = this.draw;

    if (!this.winner && !this.draw) this.current = this.opponent(p);
    events.next = this.current;
    return events;
  }

  // Lista de movimientos legales (para la IA).
  legalMoves(player = this.current) {
    const moves = [];
    const inv = this.inventory[player];
    for (let c = 0; c < this.cols; c++) {
      if (this.isColumnFrozenFor(c, player)) continue;
      if (this.dropRow(c) >= 0) moves.push({ type: 'normal', col: c });
    }
    if (inv.bomb > 0) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isColumnFrozenFor(c, player)) continue;
        if (this.dropRow(c) >= 0) moves.push({ type: 'bomb', col: c });
      }
    }
    if (inv.block > 0) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isColumnFrozenFor(c, player)) continue;
        const r1 = this.dropRow(c);
        if (r1 >= 0 && r1 + 1 < this.rows) moves.push({ type: 'block', col: c });
      }
    }
    if (inv.freeze > 0) {
      for (let c = 0; c < this.cols; c++) moves.push({ type: 'freeze', col: c });
    }
    if (inv.swap > 0) {
      const opp = player === 1 ? 2 : 1;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.board[r][c] === opp) moves.push({ type: 'swap', target: { r, c } });
        }
      }
    }
    return moves;
  }
}
