import { Component, type ReactNode } from 'react';
import { database } from '../db/database';

type Props = { children: ReactNode };
type State = { error: Error | null; exporting: boolean; exportError: string | null };

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null, exporting: false, exportError: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  private async exportarRespaldo(): Promise<void> {
    this.setState({ exporting: true, exportError: null });
    try {
      const contenido = await database.exportarRespaldo();
      const blob = new Blob([contenido], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'CAMELLO-respaldo-emergencia.json';
      enlace.click();
      URL.revokeObjectURL(url);
      this.setState({ exporting: false });
    } catch (error: unknown) {
      this.setState({ exporting: false, exportError: error instanceof Error ? error.message : String(error) });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="pantalla-error" role="alert">
        <section className="tarjeta">
          <h1>CAMELLO necesita recuperarse</h1>
          <p>La aplicación encontró un error inesperado. Antes de recargar, puedes intentar exportar un respaldo de los datos.</p>
          <div className="fila-botones">
            <button type="button" className="boton-primario" onClick={() => void this.exportarRespaldo()} disabled={this.state.exporting}>{this.state.exporting ? 'Exportando respaldo…' : 'Exportar respaldo'}</button>
            <button type="button" className="boton-secundario" onClick={() => window.location.reload()}>Recargar CAMELLO</button>
          </div>
          {this.state.exportError && <p className="texto-error">No se pudo exportar el respaldo: {this.state.exportError}</p>}
          <details><summary>Detalles técnicos</summary><pre>{this.state.error.message}</pre></details>
        </section>
      </main>
    );
  }
}
