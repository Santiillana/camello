import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

const schemaSource = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const databaseSource = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8');

assert.match(databaseSource, /const \{ version: currentVersion = 0 \} = await this\.db\.getVersion\(\);/);
assert.match(databaseSource, /await db\.beginTransaction\(\);/);
assert.match(databaseSource, /await db\.execute\(stmt, false\);/);
assert.match(databaseSource, /PRAGMA user_version/);
assert.match(databaseSource, /await db\.rollbackTransaction\(\);/);

const versionLine = schemaSource
  .split('\n')
  .find((line) => line.startsWith('export const DB_VERSION = '));
assert.ok(versionLine);

const expectedVersion = Number(versionLine.split('=')[1].replace(';', '').trim());
const expectedTables = [
  ...new Set(
    schemaSource
      .split('\n')
      .filter((line) => line.includes('CREATE TABLE IF NOT EXISTS '))
      .map((line) => line.split('CREATE TABLE IF NOT EXISTS ')[1].split(' (')[0])
  ),
];

const statements = schemaSource
  .split('`')
  .filter((segment) => segment.trim().startsWith('CREATE TABLE IF NOT EXISTS') || segment.trim().startsWith('CREATE INDEX IF NOT EXISTS'))
  .map((segment) => segment.trim());

const initSqlJs = require('sql.js');
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
const SQL = await initSqlJs({ locateFile: () => wasmPath });
const db = new SQL.Database();

async function init() {
  const currentVersion = Number(db.exec('PRAGMA user_version;')[0].values[0][0]);

  if (currentVersion > expectedVersion) {
    throw new Error('La base de prueba tiene una versión superior a la esperada.');
  }

  if (currentVersion < expectedVersion) {
    db.run('BEGIN;');

    try {
      for (const statement of statements) {
        db.run(statement);
      }

      db.run('PRAGMA user_version = ' + expectedVersion + ';');
      db.run('COMMIT;');
    } catch (error) {
      db.run('ROLLBACK;');
      throw error;
    }
  }

  const rows = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const actualTables = rows[0]?.values.map(([name]) => String(name)) ?? [];

  assert.deepEqual(actualTables, [...expectedTables].sort());
  assert.equal(Number(db.exec('PRAGMA user_version;')[0].values[0][0]), expectedVersion);
}

await init();
await init();

const producto = db.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'productos';"
);
assert.equal(producto[0]?.values.length ?? 0, 1);

process.stdout.write(
  'DB init check OK: ' + expectedTables.length + ' tablas, user_version=' + expectedVersion + ', init() idempotente.\n'
);
