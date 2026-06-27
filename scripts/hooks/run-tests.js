/**
 * Hook: PostToolUse → Write|Edit
 * Objective : Run the full Vitest suite after every file edit or write.
 * Condition : Any Edit or Write tool call completes successfully.
 * Action    : Execute `npx vitest run`. On failure, inject a structured
 *             instruction into Claude's context so it explains the errors
 *             to the user and waits for explicit approval before fixing.
 */
import { execSync }        from 'child_process';
import { fileURLToPath }   from 'url';
import { dirname, join }   from 'path';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let output = '';
let passed = true;

try {
  output = execSync('npx vitest run --reporter=verbose', {
    cwd: PROJECT,
    encoding: 'utf8',
    timeout: 55_000,
  });
} catch (err) {
  output  = (err.stdout || '') + '\n' + (err.stderr || '');
  passed  = false;
}

if (passed) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName:     'PostToolUse',
      additionalContext: '✅ Suite de pruebas: TODAS PASAN. Sin regresiones tras el último cambio.',
    },
  }));
} else {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        '⛔ PRUEBAS FALLIDAS después de este cambio.\n\n' +
        '--- Salida de Vitest ---\n' +
        output.slice(-3000) +
        '\n--- Fin de salida ---\n\n' +
        'INSTRUCCIÓN OBLIGATORIA (Error Hook activo):\n' +
        '1. Analiza cada prueba fallida y explícala en lenguaje claro al usuario.\n' +
        '2. Propón un plan de corrección específico (qué líneas cambiarías y por qué).\n' +
        '3. NO toques ningún archivo hasta recibir confirmación explícita del usuario ("sí", "procede", "hazlo").',
    },
  }));
}
