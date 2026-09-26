import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
const execFileAsync = promisify(execFile);

async function runDbScenario(scenario) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['--experimental-strip-types', 'scripts/verify-db.mjs'],
    {
      cwd: process.cwd(),
      env: { ...process.env, CAMELLO_DB_SCENARIO: scenario },
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  if (stderr && !stderr.includes('ExperimentalWarning')) {
    throw new Error(stderr);
  }
  return stdout;
}

describe('CAMELLO v1.0.0 · escenarios de base de datos', () => {
  const escenarios = [
    ['migraciones desde base vacía', 'migraciones-vacia'],
    ['idempotencia de migraciones', 'idempotencia'],
    ['rechazo de versión mayor', 'version-mayor'],
    ['flujo de ventas', 'ventas'],
    ['flujo de cartera', 'cartera'],
    ['cálculo de utilidad', 'utilidad'],
    ['persistencia después de recargar la base', 'persistencia'],
    ['arranque con una base ya migrada', 'base-ya-migrada'],
  ];

  for (const [nombre, escenario] of escenarios) {
    it(nombre, async () => {
      const salida = await runDbScenario(escenario);
      expect(salida).toContain('PASÓ');
    });
  }
});
