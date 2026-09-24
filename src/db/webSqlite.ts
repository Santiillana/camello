import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

type SqlValue = string | number | Uint8Array | null;
type StoredValue = string | Uint8Array | ArrayBuffer | Blob | number[] | Record<string, unknown> | null | undefined;
type JsonRecord = Record<string, unknown>;

const STORE_DB = 'camelloWebSqlite';
const STORE_NAME = 'databases';
const STORE_KEY = 'camelloSQLite.db';
const LEGACY_STORE_DB = 'jeepSqliteStore';
const LOCAL_STORAGE_KEY = 'camello.sqlite.v1';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSqlValueArray(value: unknown): value is SqlValue[] {
  return Array.isArray(value) && value.every((item) =>
    item == null || typeof item === 'string' || typeof item === 'number' || item instanceof Uint8Array
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(texto: string): Uint8Array {
  const binary = atob(texto);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toSqlParams(params: unknown[]): SqlValue[] {
  return params.map((value) => {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Uint8Array) return value;
    throw new TypeError('Parámetro SQLite no soportado.');
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function toBytes(value: StoredValue): Promise<Uint8Array | null> {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return base64ToBytes(value);
    } catch {
      return null;
    }
  }
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (Array.isArray(value)) return Uint8Array.from(value.filter((item): item is number => typeof item === 'number'));
  if (isRecord(value) && 'buffer' in value) {
    const buffer = value.buffer;
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  }
  return null;
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
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo leer SQLite de IndexedDB.'));
    });
    db.close();
    return toBytes(value);
  } catch {
    return null;
  }
}

async function writeStore(name: string, key: string, bytes: Uint8Array): Promise<void> {
  const base64 = bytesToBase64(bytes);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, base64);
  } catch {
    // Fallback best-effort; IndexedDB sigue siendo la persistencia principal.
  }

  const db = await openStore(name);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(base64, key);
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
    // Limpieza best-effort para dejar la base en estado recuperable.
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

    let persisted = await readStore(STORE_DB, STORE_KEY);
    if (!persisted || persisted.byteLength === 0) {
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (local) persisted = base64ToBytes(local);
      } catch {
        // Se intentará la persistencia legacy.
      }
    }
    if (!persisted || persisted.byteLength === 0) {
      persisted = await readStore(LEGACY_STORE_DB, this.databaseName + 'SQLite.db');
    }

    this.db = persisted && persisted.byteLength > 0
      ? new SQL.Database(persisted)
      : new SQL.Database();
  }

  private getDb(): SqlJsDatabase {
    if (!this.db) throw new Error('SQLite web no está abierta.');
    return this.db;
  }

  async execute(sql: string, _transaction = true): Promise<void> {
    this.getDb().exec(sql);
  }

  async run(sql: string, params: unknown[] = [], _transaction = true): Promise<{ changes: { changes: number; lastId: number } }> {
    const db = this.getDb();
    db.run(sql, toSqlParams(params));
    const result = db.exec('SELECT changes() AS changes, last_insert_rowid() AS lastId;');
    const row = result[0]?.values?.[0] ?? [];
    return {
      changes: {
        changes: Number(row[0] ?? 0),
        lastId: Number(row[1] ?? 0),
      },
    };
  }

  async query(sql: string, params: unknown[] = []): Promise<{ values: JsonRecord[]; columns: string[] }> {
    const statement = this.getDb().prepare(sql);
    try {
      statement.bind(toSqlParams(params));
      const values: JsonRecord[] = [];
      const columns = statement.getColumnNames();
      while (statement.step()) {
        const row = statement.getAsObject();
        if (isRecord(row)) values.push(row);
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
    await writeStore(STORE_DB, STORE_KEY, this.getDb().export());
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

  async replaceFromJson(data: JsonRecord, version: number): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file) => this.wasmBasePath + file,
    });
    const next = new SQL.Database();
    const quote = (value: string): string => '"' + value.replace(/"/g, '""') + '"';
    const tables = Array.isArray(data.tables) ? data.tables : [];

    try {
      for (const rawTable of tables) {
        if (!isRecord(rawTable)) continue;
        const name = typeof rawTable.name === 'string' ? rawTable.name : '';
        if (!name) continue;

        const schema = Array.isArray(rawTable.schema) ? rawTable.schema : [];
        const definitions: string[] = [];
        for (const rawColumn of schema) {
          if (!isRecord(rawColumn)) continue;
          const value = typeof rawColumn.value === 'string' ? rawColumn.value : '';
          if (!value) continue;
          if (typeof rawColumn.foreignkey === 'string') {
            definitions.push(quote(rawColumn.foreignkey) + ' ' + value);
            continue;
          }
          const columnName = typeof rawColumn.column === 'string' ? rawColumn.column : '';
          if (columnName) definitions.push(quote(columnName) + ' ' + value);
        }
        if (!definitions.length) continue;

        next.exec('CREATE TABLE ' + quote(name) + ' (' + definitions.join(', ') + ');');

        const values = Array.isArray(rawTable.values) ? rawTable.values : [];
        for (const rawRow of values) {
          if (!isSqlValueArray(rawRow) || rawRow.length === 0) continue;
          next.run(
            'INSERT INTO ' + quote(name) + ' VALUES (' + rawRow.map(() => '?').join(', ') + ');',
            rawRow.filter((value): value is string | number | Uint8Array | null => value == null || typeof value === 'string' || typeof value === 'number' || value instanceof Uint8Array),
          );
        }

        const indexes = Array.isArray(rawTable.indexes) ? rawTable.indexes : [];
        for (const rawIndex of indexes) {
          if (!isRecord(rawIndex)) continue;
          const indexName = typeof rawIndex.name === 'string' ? rawIndex.name : '';
          const expression = typeof rawIndex.value === 'string' ? rawIndex.value : '';
          if (indexName && expression) {
            const unique = String(rawIndex.mode ?? '').toUpperCase() === 'UNIQUE' ? 'UNIQUE ' : '';
            next.exec('CREATE ' + unique + 'INDEX ' + quote(indexName) + ' ON ' + quote(name) + ' (' + expression + ');');
          }
        }

        const triggers = Array.isArray(rawTable.triggers) ? rawTable.triggers : [];
        for (const rawTrigger of triggers) {
          if (!isRecord(rawTrigger)) continue;
          const triggerName = typeof rawTrigger.name === 'string' ? rawTrigger.name : '';
          const timeevent = typeof rawTrigger.timeevent === 'string' ? rawTrigger.timeevent : '';
          const logic = typeof rawTrigger.logic === 'string' ? rawTrigger.logic : '';
          const condition = typeof rawTrigger.condition === 'string' && rawTrigger.condition ? ' WHEN ' + rawTrigger.condition : '';
          if (triggerName && timeevent && logic) {
            next.exec('CREATE TRIGGER ' + quote(triggerName) + ' ' + timeevent + condition + ' BEGIN ' + logic + ' END;');
          }
        }
      }

      const views = Array.isArray(data.views) ? data.views : [];
      for (const rawView of views) {
        if (!isRecord(rawView)) continue;
        const name = typeof rawView.name === 'string' ? rawView.name : '';
        const sql = typeof rawView.value === 'string' ? rawView.value : '';
        if (name && sql) next.exec('CREATE VIEW ' + quote(name) + ' AS ' + sql + ';');
      }

      next.exec('PRAGMA user_version = ' + Math.max(0, Math.floor(version)) + ';');
    } catch (error) {
      next.close();
      throw error;
    }

    if (this.db) this.db.close();
    this.db = next;
    await this.persist();
  }

  async deletePersistedDatabase(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    await eraseStore(STORE_DB, STORE_KEY);
    await eraseStore(LEGACY_STORE_DB, this.databaseName + 'SQLite.db');
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // localStorage no disponible.
    }
  }
}
