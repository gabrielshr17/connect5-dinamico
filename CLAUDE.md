# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

ES Modules require an HTTP server — opening `index.html` directly via `file://` won't work.

```bash
npx serve .          # Node
python -m http.server 8000   # Python
```

Then open `http://localhost:8000`. No build step, no dependencies to install.

## Architecture

Pure **HTML + CSS + JS (ES Modules)**, no framework, no bundler. PeerJS is loaded from CDN in `index.html`.

```
index.html          ← entry point; loads PeerJS CDN + <script type="module" src="js/ui.js">
css/styles.css      ← all styles (3D board, animations, modals, chat)
js/
  game.js    ← pure game logic (no DOM); exported class Connect5 + constants
  ai.js      ← AI: chooseMove(game, player, difficulty) — 'facil'|'medio'|'dificil'
  net.js     ← NetGame class wrapping PeerJS; host() / join(id) / send() / destroy()
  audio.js   ← synthesized SFX via Web Audio API; Sfx.drop/bomb/win/etc.
  logger.js  ← in-game event log; log(cat, msg) mirrors to console
  ui.js      ← everything else: DOM wiring, animations, online sync, timers, chat
```

`ui.js` is the only file that touches the DOM. It imports from all other modules. `game.js` and `ai.js` are DOM-free and can be used/tested independently.

## Key conventions

**Board coordinates:** `board[r][c]` where `r=0` is the **bottom** row. Visual rendering inverts this (rows drawn top-down in DOM, but logical row 0 = bottom).

**Game state serialization:** `Connect5.toState()` / `Connect5.fromState(s)` produce plain objects safe to send over the network. The online mode sends the **full state** on every move (not just deltas) to recover from packet loss.

**Online sync protocol:** Host = player 1, Guest = player 2. After each local move, `sendState(ev)` sends `{ type:'state', seq, state, fx }` and retries every 2.5 s until the peer replies `{ type:'ack', seq }`. Duplicate or out-of-order states are detected via `lastAppliedSeq`.

**Freeze mechanic:** `game.frozen` is an array of `{ col, target, turns }`. On each move by `target`, turns decrements; entries reaching 0 are removed. `isColumnFrozenFor(col, player)` checks it.

**`busy` flag:** Set to `true` during bomb explosion animation (600 ms). `canInteract()` checks it; nothing should apply game moves while `busy === true`.

**Chat messages** use `document.createTextNode(text)` to avoid XSS — never set `innerHTML` with user input.

## Adding a new ability

1. Add the key to `DEFAULT_INVENTORY` and `ABILITIES` in `game.js`.
2. Add a `case` in `isLegal()` and `applyMove()` in `Connect5`.
3. Add it to `legalMoves()` so the AI considers it.
4. Add AI handling in `ai.js` (`chooseMove` and the difficulty-specific functions).
5. Add metadata to `ABIL_META` in `ui.js` and a sound in `audio.js`.

## Deployment

GitHub Pages: push to `main`, set *Settings → Pages → Source: main / (root)*. The PeerJS invite link is built from `location.origin + location.pathname`, so it works on any domain including Pages.

## Baseline (2026-06-26, commit `819df96`)

Verified with Playwright headless Chromium against `npx serve` on `localhost:8765`.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Page load | ✅ PASS | Title correct, all assets load, no 404s |
| 2 | Help modal | ✅ PASS | Opens and closes, lists all 4 abilities correctly |
| 3 | AI difficulty modal | ✅ PASS | 3 buttons (Fácil / Medio / Difícil), ghost-click guard works |
| 4 | Board renders | ✅ PASS | Exactly 80 cells (10×8) |
| 5 | 3D board transform | ✅ PASS | Initial `rotateX(14deg) rotateY(0deg)` applied on load |
| 6 | 3D drag rotation | ✅ PASS | Dragging changes the transform value |
| 7 | HUD — turn indicator | ✅ PASS | Shows `"Turno: Tú (Rojo)"` at game start |
| 8 | HUD — turn timer | ✅ PASS | Visible and counting down from 7s at game start |
| 9 | HUD — scoreboard | ✅ PASS | Both sides rendered |
| 10 | Ability buttons | ✅ PASS | All 5 present and enabled at turn start (Normal ∞ / Bomba 2 / Bloque 2 / Congelar 2 / Cambio 2) |
| 11 | Normal drop | ✅ PASS | Disc appears in clicked column |
| 12 | Bomb ability | ✅ PASS | Correct hint, executes, explosion animation plays |
| 13 | Freeze ability | ✅ PASS | Correct hint, 8 `frozen-col` cells highlighted, `❄️` turn badge shown |
| 14 | Block ability | ⚠️ NOT TESTED | Button was disabled during AI's turn when test ran — not a bug, test timing issue |
| 15 | Swap ability | ⚠️ NOT TESTED | Same — test attempted during AI's turn; targetable highlights didn't appear |
| 16 | Timer auto-move | ⚠️ NOT TESTED | Script crashed before reaching this step |
| 17 | Sound toggle | ⚠️ NOT TESTED | End-game modal blocked the button before test reached it |
| 18 | Column hover highlight | ⚠️ NOT TESTED | Not reached due to crash |
| 19 | Event log panel | ✅ PASS | Opens/closes, timestamped entries for all events, Copy/Download/Clear buttons present |
| 20 | Back to menu | ✅ PASS | Returns to menu, scoreboard resets |
| 21 | Local 2-player mode | ✅ PASS | Starts immediately (no difficulty modal), turns alternate, restart clears board |
| 22 | Online lobby | ✅ PASS | Opens, PeerJS broker reachable, share link (`?join=…`) generated within 8s |
| 23 | Console errors | ✅ PASS | None detected throughout session |

**Observations:**
- Freeze badge shows `❄️ 2` not `❄️ 3` on first read — correct: AI moved once after freeze was applied, decrementing the counter.
- End modal blocked HUD clicks when the AI won mid-session — expected behavior.
- `window._game` is not accessible (module-scoped) — fine for the app, makes headless testing harder.
- Online P2P handshake not tested — lobby creation confirmed but a full two-peer connection requires two browser instances.

**Still needs testing:** Block and Swap end-to-end (need local-2P scripted run), timer auto-move, sound toggle, column hover highlight (`col-hot`).
