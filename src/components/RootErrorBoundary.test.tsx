// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootErrorBoundary from './RootErrorBoundary';

function BrokenComponent(): never {
  throw new Error('error deliberado de prueba');
}

describe('RootErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('captura un error real y muestra recuperación en vez de pantalla blanca', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <RootErrorBoundary>
          <BrokenComponent />
        </RootErrorBoundary>,
      );
    });

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain('CAMELLO necesita recuperarse');
    expect(host.textContent).toContain('Exportar respaldo');
    expect(host.textContent).toContain('Recargar CAMELLO');
    expect(consoleError).toHaveBeenCalled();
    root.unmount();
  });
});
