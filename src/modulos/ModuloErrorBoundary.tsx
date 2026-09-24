import { Component, type ReactNode } from 'react';
import type { ModuloContrato, ContextoModulo } from './contrato';
import { database } from '../db/database';

type Props = { modulo: ModuloContrato; contexto: ContextoModulo; children: ReactNode };
type State = { error: Error | null };

export default class ModuloErrorBoundary extends Component<Props,State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(): void {
    void database.guardarModuloHabilitado(this.props.modulo.id, false);
  }

  render() {
    if (this.state.error) {
      return <section className="tarjeta"><h1>Módulo desactivado por un error</h1><p className="texto-error">Puedes reactivarlo desde Configuración &gt; Módulos después de revisar el problema.</p></section>;
    }
    return this.props.children;
  }
}
