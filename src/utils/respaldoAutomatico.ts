import { calcularChecksum } from './respaldo';

export type BackupItem = {
  id: string;
  kind: 'daily' | 'weekly' | 'monthly';
  date: string;
  json: string;
  checksum: string;
};

const DB_NAME = 'camello-backups';
const STORE = 'backups';
const VERSION = 1;

function esBackupItem(valor: unknown): valor is BackupItem {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const registro = {
    id: 'id' in valor ? valor.id : undefined,
    kind: 'kind' in valor ? valor.kind : undefined,
    date: 'date' in valor ? valor.date : undefined,
    json: 'json' in valor ? valor.json : undefined,
    checksum: 'checksum' in valor ? valor.checksum : undefined,
  };
  return typeof registro.id === 'string'
    && (registro.kind === 'daily' || registro.kind === 'weekly' || registro.kind === 'monthly')
    && typeof registro.date === 'string'
    && typeof registro.json === 'string'
    && typeof registro.checksum === 'string';
}

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
    req.onsuccess = () => {
      const resultado: unknown = req.result;
      const items = Array.isArray(resultado) ? resultado.filter(esBackupItem) : [];
      resolve(items.sort((a, b) => b.date.localeCompare(a.date)));
    };
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

export async function necesitaRespaldoAutomatico(ahora = new Date()): Promise<boolean> {
  const fecha = ahora.toISOString().slice(0, 10);
  const day = ahora.getUTCDate();
  const tipo: BackupItem['kind'] = day === 1 ? 'monthly' : ahora.getUTCDay() === 0 ? 'weekly' : 'daily';
  const items = await listar();
  const clave = tipo === 'monthly' ? fecha.slice(0,7) : fecha;
  return !items.some((item) => item.kind === tipo && item.date.slice(0, tipo === 'monthly' ? 7 : 10) === clave);
}

export async function guardarRespaldoAutomatico(json: string, ahora = new Date()): Promise<void> {
  const fecha = ahora.toISOString();
  const dia = fecha.slice(0, 10);
  const existentes = await listar();
  const kind: BackupItem['kind'] = ahora.getUTCDate() === 1 ? 'monthly' : ahora.getUTCDay() === 0 ? 'weekly' : 'daily';
  const idKey = kind === 'monthly' ? dia.slice(0,7) : dia;
  if (existentes.some((item) => item.id === kind + '-' + idKey)) return;
  const checksum = await calcularChecksum(json);

  await guardar({
    id: kind + '-' + idKey,
    kind,
    date: fecha,
    json,
    checksum,
  });

  const items = await listar();
  const diarios = items.filter((item) => item.kind === 'daily').sort((a, b) => b.date.localeCompare(a.date));
  const semanales = items.filter((item) => item.kind === 'weekly').sort((a, b) => b.date.localeCompare(a.date));
  const mensuales = items.filter((item) => item.kind === 'monthly').sort((a, b) => b.date.localeCompare(a.date));

  for (const item of diarios.slice(7)) await eliminar(item.id);
  for (const item of semanales.slice(4)) await eliminar(item.id);
  for (const item of mensuales.slice(3)) await eliminar(item.id);
}

export async function listarRespaldosAutomaticos(): Promise<BackupItem[]> {
  return listar();
}
