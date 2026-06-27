/**
 * Hook: PreToolUse → Bash
 * Objective : Intercept any Bash command that deletes files or directories.
 * Condition : Bash tool is about to run and its command matches known
 *             deletion patterns (rm, Remove-Item, del, rmdir, unlink, rd /s).
 * Action    : Trigger Claude Code's "ask" permission flow, injecting a
 *             description of the command and a prompt for Claude to explain
 *             the file's purpose before the user decides.
 *             If no deletion is detected the hook exits silently (exit 0).
 *
 * CONFLICT NOTE: This hook asks for confirmation — it does NOT force deletion
 * nor does it unconditionally block it. No other hook in this project forces
 * deletion either. The pair satisfies the constraint: one hook may ask, none
 * may force in the opposite direction.
 */
import { readFileSync } from 'fs';

let input = {};
try {
  const raw = readFileSync(0, 'utf8').trim();
  if (raw) input = JSON.parse(raw);
} catch { /* no stdin or malformed — pass through */ }

const cmd = (input?.tool_input?.command ?? '').trim();

const DELETION_RE = [
  /\brm\s/i,
  /\brm$/i,
  /remove-item\b/i,
  /\brmdir\b/i,
  /(?:^|\s)del\s/i,
  /\bunlink\b/i,
  /\brd\s+\/s\b/i,
];

if (!DELETION_RE.some(re => re.test(cmd))) {
  process.exit(0);
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason:
      `⚠️ Comando de eliminación detectado:\n  ${cmd}\n\n` +
      `Antes de ejecutarlo, debes:\n` +
      `• Explicar al usuario qué archivo(s) se eliminarán y cuál es su función en el proyecto.\n` +
      `• Pedir confirmación explícita (sí / no) antes de proceder.\n` +
      `• Solo ejecutar si el usuario confirma.`,
  },
}));
