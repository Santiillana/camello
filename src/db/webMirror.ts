const DB_NAME = 'camelloPersistenceMirror';
const STORE_NAME = 'snapshots';
const KEY = 'sqlite-full';

function abrirEspejo(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el espejo SQLite web.'));
  });
}

export async function guardarEspejoSqlite(json: string): Promise<void> {
  const db = await abrirEspejo();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(json, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el espejo SQLite web.'));
    tx.onabort = () => reject(tx.error ?? new Error('Se abortó el guardado del espejo SQLite web.'));
  });
  db.close();
}

export async function leerEspejoSqlite(): Promise<string | null> {
  const db = await abrirEspejo();
  const value = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer el espejo SQLite web.'));
  });
  db.close();
  return value;
}

export async function borrarEspejoSqlite(): Promise<void> {
  const db = await abrirEspejo();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar el espejo SQLite web.'));
    tx.onabort = () => reject(tx.error ?? new Error('Se abortó el borrado del espejo SQLite web.'));
  });
  db.close();
}
