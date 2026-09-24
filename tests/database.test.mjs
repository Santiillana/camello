import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

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
    ['arranque con IndexedDB vacío', 'indexeddb-vacia'],
    ['arranque con una base ya migrada', 'base-ya-migrada'],
  ];

  for (const [nombre, escenario] of escenarios) {
    it(nombre, async () => {
      if (escenario === 'indexeddb-vacia') {
        const nombreDb = 'camello-vitest-vacio';
        await new Promise((resolve, reject) => {
          const eliminar = indexedDB.deleteDatabase(nombreDb);
          eliminar.onsuccess = () => resolve();
          eliminar.onerror = () => reject(eliminar.error ?? new Error('No se pudo limpiar IndexedDB.'));
          eliminar.onblocked = () => reject(new Error('IndexedDB quedó bloqueado al limpiar.'));
        });
        await new Promise((resolve, reject) => {
          const request = indexedDB.open(nombreDb, 1);
          request.onupgradeneeded = () => request.result.createObjectStore('estado', { keyPath: 'id' });
          request.onsuccess = () => {
            const db = request.result;
            expect(db.objectStoreNames.contains('estado')).toBe(true);
            db.close();
            resolve();
          };
          request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB vacío.'));
        });
        return;
      }

      const salida = await runDbScenario(escenario);
      expect(salida).toContain('PASÓ');
    });
  }
});
