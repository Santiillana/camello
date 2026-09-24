import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export type TarjetaAsistente = {
  id: string;
  titulo: string;
  contenido: ReactNode;
  opcional?: boolean;
  validar?: () => string | null;
};

type Props = {
  titulo: string;
  tarjetas: TarjetaAsistente[];
  onCompletar: () => Promise<void> | void;
  onCancelar: () => void;
  textoFinal?: string;
  pasoInicial?: number;
  onPasoChange?: (paso: number) => void;
  onGuardarBorrador?: () => Promise<void> | void;
  onDescartarBorrador?: () => Promise<void> | void;
};

export default function AsistenteTarjetas({
  titulo,
  tarjetas,
  onCompletar,
  onCancelar,
  textoFinal = 'Guardar',
  pasoInicial = 0,
  onPasoChange,
  onGuardarBorrador,
  onDescartarBorrador,
}: Props) {
  const [paso, setPasoState] = useState(Math.max(0, pasoInicial));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tieneCambios, setTieneCambios] = useState(false);
  const contenidoRef = useRef<HTMLDivElement>(null);
  const actual = tarjetas[paso];

  function setPaso(valor: number | ((anterior: number) => number)) {
    setPasoState((anterior) => {
      const siguiente = typeof valor === 'function' ? valor(anterior) : valor;
      return Math.min(Math.max(0, siguiente), Math.max(0, tarjetas.length - 1));
    });
  }
  useEffect(() => {
    const acotado = Math.min(Math.max(0, pasoInicial), Math.max(0, tarjetas.length - 1));
    setPasoState(acotado);
  }, [pasoInicial, tarjetas.length]);

  useEffect(() => {
    onPasoChange?.(paso);
  }, [paso, onPasoChange]);

  const porcentaje = useMemo(
    () => Math.round(((paso + 1) / Math.max(1, tarjetas.length)) * 100),
    [paso, tarjetas.length],
  );

  if (!actual) return null;

  function validar(): boolean {
    const mensaje = actual.validar?.() ?? null;
    setError(mensaje);
    return !mensaje;
  }

  function siguiente() {
    if (!validar()) return;
    setTieneCambios(true);
    if (paso < tarjetas.length - 1) {
      setPaso((valor) => valor + 1);
      setError(null);
    } else {
      void completar();
    }
  }

  function anterior() {
    setError(null);
    setPaso((valor) => Math.max(0, valor - 1));
  }

  async function cancelar() {
    if (!tieneCambios) {
      onCancelar();
      return;
    }
    const descartar = window.confirm('Guardar borrador / Descartar\n\nAceptar = Descartar\nCancelar = Guardar borrador');
    if (descartar) {
      await onDescartarBorrador?.();
      onCancelar();
      return;
    }
    await onGuardarBorrador?.();
    onCancelar();
  }

  useEffect(() => {
    const primerCampo = contenidoRef.current?.querySelector<HTMLElement>('input, textarea, select, button');
    primerCampo?.focus();
  }, [paso]);

  function manejarEnter(event: KeyboardEvent) {
    if (event.key !== 'Enter' || (event.target instanceof HTMLTextAreaElement)) return;
    event.preventDefault();
    siguiente();
  }

  async function completar() {
    setGuardando(true);
    setError(null);
    try {
      await onCompletar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section
      className="asistente-tarjetas asistente-overlay"
      aria-label={titulo}
      role="dialog"
      aria-modal="true"
      onKeyDown={manejarEnter}
      onInput={() => setTieneCambios(true)}
    >
      <div className="asistente-encabezado">
        <div>
          <p className="texto-kicker">Asistente</p>
          <h2>{titulo}</h2>
        </div>
        <button type="button" className="boton-texto asistente-cerrar" aria-label="Cerrar" onClick={() => void cancelar()}>×</button>
      </div>

      <div className="asistente-progreso" aria-label={`Paso ${paso + 1} de ${tarjetas.length}`}>
        <div className="asistente-progreso-barra">
          <span style={{ width: porcentaje + '%' }} />
        </div>
        <span>{porcentaje}% · {paso + 1}/{tarjetas.length}</span>
      </div>

      <article className="asistente-tarjeta">
        <header>
          <p className="texto-kicker">Tarjeta {paso + 1}</p>
          <h3>{actual.titulo}</h3>
        </header>
        <div className="asistente-contenido" ref={contenidoRef}>{actual.contenido}</div>
        {actual.opcional && (
          <button
            type="button"
            className="boton-texto"
            onClick={() => {
              setTieneCambios(true);
              if (paso < tarjetas.length - 1) {
                setPaso((valor) => valor + 1);
                setError(null);
              } else {
                void completar();
              }
            }}
          >
            Omitir
          </button>
        )}
      </article>

      {error && <p className="texto-error" role="alert">{error}</p>}

      <div className="asistente-acciones">
        <button type="button" className="boton-secundario" onClick={anterior} disabled={paso === 0 || guardando}>
          Atrás
        </button>
        <button type="button" className="boton-primario" onClick={siguiente} disabled={guardando}>
          {guardando ? 'Guardando…' : paso === tarjetas.length - 1 ? textoFinal : 'Siguiente'}
        </button>
      </div>
    </section>
  );
}
