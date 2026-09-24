import { Capacitor } from '@capacitor/core';
import localForage from 'localforage';

function marcarEtapa(etapa: string): void {
  if (import.meta.env.VITE_E2E === '1') document.documentElement.dataset.camelloSqliteStage = etapa;
}

function webBasePath(): string {
  return import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : import.meta.env.BASE_URL + '/';
}

export async function initWebSqlite(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return;

  marcarEtapa('loader-import');
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  marcarEtapa('define-element');
  defineCustomElements(window);
  marcarEtapa('defined');
  await customElements.whenDefined('jeep-sqlite');

  const base = webBasePath();
  const jeepEl = document.querySelector('jeep-sqlite') as (HTMLElement & { wasmPath?: string; isStoreOpen?: () => Promise<boolean> }) | null;
  if (!jeepEl) throw new Error('No se encontró el elemento jeep-sqlite en index.html.');
  jeepEl.wasmPath = base + 'assets';
  marcarEtapa('element-create');

  const inicio = Date.now();
  while (Date.now() - inicio < 10000) {
    const abierto = await jeepEl.isStoreOpen?.().catch(() => false) ?? false;
    if (abierto) {
      marcarEtapa('store-open');
      break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  if (!(await jeepEl.isStoreOpen?.().catch(() => false) ?? false)) {
    throw new Error('jeep-sqlite no abrió el WebStore a tiempo.');
  }
  try {
    const store = localForage.createInstance({
      name: 'jeepSqliteStore',
      storeName: 'databases',
      driver: [localForage.INDEXEDDB],
      version: 1,
    });
    const persisted: unknown = await store.getItem('camelloSQLite.db');
    if (persisted instanceof Uint8Array) {
      await store.setItem('camelloSQLite.db', new Uint8Array(persisted));
    } else if (persisted instanceof ArrayBuffer) {
      await store.setItem('camelloSQLite.db', new Uint8Array(persisted));
    }
  } catch {
    // La normalización es preventiva; jeep-sqlite seguirá gestionando su WebStore.
  }

  marcarEtapa('ready');
}
