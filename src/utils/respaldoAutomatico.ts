import { calcularChecksum } from './respaldo';

export type BackupItem = {
  id: string;
  kind: 'daily' | 'weekly';
  date: string;
  json: string;
  checksum: string;
};

const DB_NAME = 'camello-backups';
const STORE = 'backups';
const VERSION = 1;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listar(): Promise<BackupItem[]> {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as BackupItem[]).sort((a, b) => b.date.localeCompare(a.date)));
    req.onerror = () => reject(req.error);
  });
}

async function guardar(item: BackupItem): Promise<void> {
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function eliminar(id: string): Promise<void> {
  const db = await abrir();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function guardarRespaldoAutomatico(json: string, ahora = new Date()): Promise<void> {
  const fecha = ahora.toISOString();
  const dia = fecha.slice(0, 10);
  const existentes = await listar();
  const tipoHoy: BackupItem['kind'] = ahora.getUTCDay() === 0 ? 'weekly' : 'daily';
  if (existentes.some((item) => item.id === tipoHoy + '-' + dia)) return;
  const kind: BackupItem['kind'] = ahora.getUTCDay() === 0 ? 'weekly' : 'daily';
  const checksum = await calcularChecksum(json);

  await guardar({
    id: kind + '-' + dia,
    kind,
    date: fecha,
    json,
    checksum,
  });

  const items = await listar();
  const diarios = items.filter((item) => item.kind === 'daily').sort((a, b) => b.date.localeCompare(a.date));
  const semanales = items.filter((item) => item.kind === 'weekly').sort((a, b) => b.date.localeCompare(a.date));

  for (const item of diarios.slice(7)) await eliminar(item.id);
  for (const item of semanales.slice(1)) await eliminar(item.id);
}

export async function listarRespaldosAutomaticos(): Promise<BackupItem[]> {
  return listar();
}
