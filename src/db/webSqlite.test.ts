import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { WebSqliteConnection } from './webSqlite';

const wasmPath = fileURLToPath(new URL('../../node_modules/sql.js/dist/', import.meta.url));

async function crearConexion() {
  const db = new WebSqliteConnection('camello-test', wasmPath);
  await db.open();
  return db;
}

describe('WebSqliteConnection', () => {
  it('conserva binario UTF-8 en la capa Base64 compartida', async () => {
    const { bytesToBase64, base64ToBytes } = await import('../utils/base64');
    const original = new TextEncoder().encode('CAMELLO · ñ · 🐕');
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  afterEach(async () => {
    const db = await crearConexion();
    await db.deletePersistedDatabase();
  });

  it('persists rows across close and reopen', async () => {
    const first = await crearConexion();
    await first.execute('CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL);');
    await first.run('INSERT INTO clientes (id,nombre) VALUES (?,?);', [1, 'Cliente persistente']);
    await first.persist();
    await first.close();

    const second = await crearConexion();
    const result = await second.query('SELECT id,nombre FROM clientes ORDER BY id;');
    expect(result.values).toEqual([{ id: 1, nombre: 'Cliente persistente' }]);
    await second.close();
  });

  it('restores a binary SQLite snapshot', async () => {
    const source = await crearConexion();
    await source.execute('CREATE TABLE IF NOT EXISTS prueba (id INTEGER PRIMARY KEY, valor TEXT NOT NULL);');
    await source.run('INSERT INTO prueba (id,valor) VALUES (?,?);', [7, 'restaurado']);
    const bytes = source.exportBytes();

    const target = new WebSqliteConnection('camello-test', wasmPath);
    await target.open();
    await target.replaceFromBytes(bytes);

    const result = await target.query('SELECT id,valor FROM prueba;');
    expect(result.values).toEqual([{ id: 7, valor: 'restaurado' }]);
    await target.close();
    await source.deletePersistedDatabase();
  });
});
