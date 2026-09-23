import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles.css';

// jeep-sqlite solo se usa cuando la app corre en el navegador (npm run dev / preview web),
// para poder probar la base de datos sin compilar el APK. La app Android real no lo necesita:
// usa el plugin nativo de SQLite directamente.
async function bootstrap() {
  if (Capacitor.getPlatform() === 'web') {
    const { defineCustomElements } = await import('jeep-sqlite/loader');
    defineCustomElements(window);
    await customElements.whenDefined('jeep-sqlite');

    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : import.meta.env.BASE_URL + '/';
    const jeepEl = document.createElement('jeep-sqlite');
    jeepEl.setAttribute('wasm-path', base + 'assets');
    document.body.appendChild(jeepEl);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
