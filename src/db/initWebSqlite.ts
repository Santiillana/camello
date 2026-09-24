import { Capacitor } from '@capacitor/core';

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
  let jeepEl = document.querySelector('jeep-sqlite') as HTMLElement & { wasmPath?: string } | null;

  if (!jeepEl) {
    jeepEl = document.createElement('jeep-sqlite') as HTMLElement & { wasmPath?: string };
  }

  jeepEl.wasmPath = base + 'assets';

  marcarEtapa('element-create');
  if (!jeepEl.isConnected) {
    document.body.appendChild(jeepEl);
  }
  marcarEtapa('ready');
}
