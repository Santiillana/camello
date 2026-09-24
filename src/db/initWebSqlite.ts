import { Capacitor } from '@capacitor/core';

function webBasePath(): string {
  return import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : import.meta.env.BASE_URL + '/';
}

export async function initWebSqlite(): Promise<void> {
  if (Capacitor.getPlatform() !== 'web') return;

  const { defineCustomElements, applyPolyfills } = await import('jeep-sqlite/loader');
  await applyPolyfills();
  defineCustomElements(window);
  await customElements.whenDefined('jeep-sqlite');

  const base = webBasePath();
  let jeepEl = document.querySelector('jeep-sqlite') as HTMLElement & { wasmPath?: string } | null;

  if (!jeepEl) {
    jeepEl = document.createElement('jeep-sqlite') as HTMLElement & { wasmPath?: string };
  }

  jeepEl.wasmPath = base + 'assets';

  if (!jeepEl.isConnected) {
    document.body.appendChild(jeepEl);
  }
  const listo = jeepEl as HTMLElement & {
    wasmPath?: string;
    componentOnReady?: () => Promise<unknown>;
  };
  if (listo.componentOnReady) await listo.componentOnReady();
}
