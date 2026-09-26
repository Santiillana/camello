// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const exportarRespaldo = vi.fn(async () => '{"camello_backup_version":1}');
vi.mock('../src/db/database', () => ({
  database: { exportarRespaldo },
}));

const { default: RootErrorBoundary } = await import('../src/components/RootErrorBoundary');

function ErrorDeliberado(): never {
  throw new Error('error E2E del ErrorBoundary');
}

describe('RootErrorBoundary', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('atrapa un error real de render y muestra recuperación', async () => {
    const contenedor = document.createElement('div');
    document.body.appendChild(contenedor);
    const root = createRoot(contenedor);

    await act(async () => {
      root.render(
        <RootErrorBoundary>
          <ErrorDeliberado />
        </RootErrorBoundary>,
      );
    });

    expect(contenedor.textContent).toContain('CAMELLO necesita recuperarse');
    expect(contenedor.textContent).toContain('Exportar respaldo');
    expect(contenedor.textContent).toContain('Recargar CAMELLO');
    expect(contenedor.textContent).toContain('error E2E del ErrorBoundary');
    root.unmount();
  });
});
