import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

type StoredValue = Uint8Array | ArrayBuffer | Blob | number[] | Record<string, unknown> | null | undefined;

const STORE_DB = 'camelloWebSqlite';
const STORE_NAME = 'databases';
const STORE_KEY = 'camelloSQLite.db';
const LEGACY_STORE_DB = 'jeepSqliteStore';

function toBytes(value: StoredValue): Promise<Uint8Array | null> {
  if (value == null) return Promise.resolve(null);
  if (value instanceof Uint8Array) return Promise.resolve(new Uint8Array(value));
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  if (Array.isArray(value)) return Promise.resolve(Uint8Array.from(value));
  if (typeof value === 'object' && value && 'buffer' in value) {
    const buffer = Reflect.get(value, 'buffer');
    if (buffer instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(buffer));
  }
  return Promise.resolve(null);
}

async function openStore(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB SQLite.'));
  });
}

async function readStore(name: string, key: string): Promise<Uint8Array | null> {
  try {
    const db = await openStore(name);
    const value = await new Promise<StoredValue>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as StoredValue);
      request.onerror = () => reject(request.error ?? new Error('No se pudo leer SQLite de IndexedDB.'));
    });
    db.close();
    return toBytes(value);
  } catch {
    return null;
  }
}

async function writeStore(name: string, key: string, bytes: Uint8Array): Promise<void> {
  const db = await openStore(name);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(new Uint8Array(bytes), key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar SQLite en IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Se abortó el guardado de SQLite.'));
  });
  db.close();
}

async function eraseStore(name: string, key: string): Promise<void> {
  try {
    const db = await openStore(name);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar SQLite de IndexedDB.'));
      tx.onabort = () => reject(tx.error ?? new Error('Se abortó el borrado de SQLite.'));
    });
    db.close();
  } catch {
    // La limpieza es best-effort.
  }
}

export class WebSqliteConnection {
  private db: SqlJsDatabase | null = null;
  private readonly wasmBasePath: string;
  private readonly databaseName: string;

  constructor(databaseName: string, wasmBasePath: string) {
    this.databaseName = databaseName;
    this.wasmBasePath = wasmBasePath.endsWith('/') ? wasmBasePath : wasmBasePath + '/';
  }

  async open(): Promise<void> {
    if (this.db) return;
    const SQL = await initSqlJs({
      locateFile: (file) => this.wasmBasePath + file,
    });
    const persisted = await readStore(STORE_DB, STORE_KEY) ?? await readStore(LEGACY_STORE_DB, this.databaseName + 'SQLite.db');
    this.db = persisted && persisted.byteLength > 0 ? new SQL.Database(persisted) : new SQL.Database();
  }

  private getDb(): SqlJsDatabase {
    if (!this.db) throw new Error('SQLite web no está abierta.');
    return this.db;
  }

  private async executeStatements(sql: string): Promise<void> {
    const db = this.getDb();
    db.exec(sql);
  }

  async execute(sql: string): Promise<void> {
    await this.executeStatements(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: { changes: number; lastId: number } }> {
    const db = this.getDb();
    db.run(sql, params as (string | number | Uint8Array | null | undefined)[]);
    const result = db.exec('SELECT changes() AS changes, last_insert_rowid() AS lastId;');
    const row = result[0]?.values?.[0] ?? [];
    return {
      changes: {
        changes: Number(row[0] ?? 0),
        lastId: Number(row[1] ?? 0),
      },
    };
  }

  async query(sql: string, params: unknown[] = []): Promise<{ values: Record<string, unknown>[]; columns: string[] }> {
    const db = this.getDb();
    const statement = db.prepare(sql);
    try {
      statement.bind(params as (string | number | Uint8Array | null | undefined)[]);
      const values: Record<string, unknown>[] = [];
      const columns = statement.getColumnNames();
      while (statement.step()) {
        const row = statement.getAsObject();
        values.push(row as Record<string, unknown>);
      }
      return { values, columns };
    } finally {
      statement.free();
    }
  }

  async beginTransaction(): Promise<void> {
    this.getDb().exec('BEGIN TRANSACTION;');
  }

  async commitTransaction(): Promise<void> {
    this.getDb().exec('COMMIT;');
  }

  async rollbackTransaction(): Promise<void> {
    this.getDb().exec('ROLLBACK;');
  }

  async close(): Promise<void> {
    if (!this.db) return;
    await this.persist();
    this.db.close();
    this.db = null;
  }

  async persist(): Promise<void> {
    const db = this.getDb();
    await writeStore(STORE_DB, STORE_KEY, db.export());
  }

  exportBytes(): Uint8Array {
    return this.getDb().export();
  }

  async replaceFromBytes(bytes: Uint8Array): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file) => this.wasmBasePath + file,
    });
    if (this.db) this.db.close();
    this.db = new SQL.Database(new Uint8Array(bytes));
    await this.persist();
  }

  async deletePersistedDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    await eraseStore(STORE_DB, STORE_KEY);
    await eraseStore(LEGACY_STORE_DB, this.databaseName + 'SQLite.db');
  }
}
