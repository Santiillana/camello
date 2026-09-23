import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { database } from '../db/database';
import type { RutaConResumen, TipoRuta } from '../types';
import { fechaLocalISO, formatoFecha, formatoMoneda } from '../utils/format';

const TIPOS: TipoRuta[] = ['Puerta a puerta', 'Barrio', 'Vereda', 'Sector', 'Visita comercial'];
const ETIQUETA_ESTADO: Record<string, string> = {
  PROGRAMADA: 'Programada',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

export default function Rutas() {
  const [rutas, setRutas] = useState<RutaConResumen[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  async function cargar() {
    try {
      setRutas(await database.listarRutas());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    setMostrarForm(params.get('nueva') === '1');
    void cargar();
  }, [params]);

  const rutaActiva = rutas.find((r) => r.estado === 'EN_CURSO');

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Recorridos comerciales</p>
          <h1>Rutas</h1>
        </div>
        {!rutaActiva && (
          <button className="boton-secundario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Nueva ruta'}
          </button>
        )}
      </header>

      {rutaActiva && (
        <Link to={'/rutas/' + rutaActiva.id} className="banner-ruta-activa">
          🧭 Ruta en curso: {rutaActiva.nombre || rutaActiva.tipo}
        </Link>
      )}

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && !rutaActiva && (
        <FormNuevaRuta
          onCreada={async (id, iniciarAhora) => {
            setMostrarForm(false);
            await cargar();
            if (iniciarAhora) navigate('/rutas/' + id);
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      <ul className="lista-rutas">
        {rutas.map((ruta) => (
          <li key={ruta.id} className="tarjeta">
            <Link to={'/rutas/' + ruta.id} className="tarjeta-ruta">
              <div>
                <strong>{ruta.nombre || ruta.tipo}</strong>
                <div className="detalle-cliente">
                  {ruta.tipo} · {formatoFecha(ruta.fecha_planificada || ruta.fecha)} · {ETIQUETA_ESTADO[ruta.estado]}
                </div>
              </div>
              <div className="lado-derecho-cliente">
                <span>{ruta.vendidos}/{ruta.paquetes_llevados} vendidos</span>
                <strong>{formatoMoneda(ruta.total_vendido)}</strong>
              </div>
            </Link>
            {ruta.estado === 'PROGRAMADA' && !rutaActiva && (
              <Link className="boton-primario boton-grande" to={'/rutas/' + ruta.id}>
                ▶ Iniciar ruta
              </Link>
            )}
          </li>
        ))}
        {rutas.length === 0 && <p className="texto-vacio">Todavía no has registrado rutas.</p>}
      </ul>
    </div>
  );
}

function FormNuevaRuta({
  onCreada,
  onCancelar,
}: {
  onCreada: (id: number, iniciarAhora: boolean) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('Ruta de hoy');
  const [tipo, setTipo] = useState<TipoRuta>('Puerta a puerta');
  const [fecha, setFecha] = useState(fechaLocalISO());
  const [hora, setHora] = useState('');
  const [paquetes, setPaquetes] = useState(20);
  const [iniciarAhora, setIniciarAhora] = useState(false);
  const [usarGps, setUsarGps] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      if (iniciarAhora) {
        let lat: number | undefined;
        let lng: number | undefined;
        if (usarGps && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 30000 }),
            );
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch {
            // La ubicación es opcional.
          }
        }

        const id = await database.iniciarRuta({
          nombre,
          tipo,
          paquetes_llevados: paquetes,
          lat_inicio: lat,
          lng_inicio: lng,
        });
        await onCreada(id, true);
      } else {
        const id = await database.crearRuta({
          nombre,
          tipo,
          fecha_planificada: fecha,
          hora_planificada: hora || undefined,
          paquetes_llevados: paquetes,
        });
        await onCreada(id, false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <div className="separador-seccion">
        <strong>{iniciarAhora ? 'Iniciar ruta' : 'Programar ruta'}</strong>
        <span className="texto-vacio">Puedes dejarla programada y arrancarla después.</span>
      </div>

      <label>
        Nombre de la ruta
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>

      <label>
        Tipo de recorrido
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRuta)}>
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>

      {!iniciarAhora && (
        <div className="grid-dos-columnas">
          <label>Fecha planificada<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required /></label>
          <label>Hora planificada<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
        </div>
      )}

      <label>
        ¿Cuántos paquetes llevas?
        <input type="number" min={1} step={1} value={paquetes} onChange={(e) => setPaquetes(Number(e.target.value))} required />
      </label>

      {iniciarAhora && (
        <label className="fila-checkbox">
          <input type="checkbox" checked={usarGps} onChange={(e) => setUsarGps(e.target.checked)} />
          Registrar ubicación de inicio con GPS
        </label>
      )}

      {error && <p className="texto-error">{error}</p>}

      <div className="fila-botones">
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="boton-secundario" onClick={() => setIniciarAhora((v) => !v)}>
          {iniciarAhora ? 'Programar' : 'Iniciar ahora'}
        </button>
      </div>

      <button type="submit" className="boton-primario boton-grande" disabled={guardando}>
        {guardando ? 'Guardando…' : iniciarAhora ? '▶ Iniciar ruta' : 'Guardar ruta'}
      </button>
    </form>
  );
}
