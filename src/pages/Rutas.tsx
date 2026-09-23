import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { database } from '../db/database';
import type { RutaConResumen, TipoRuta } from '../types';
import { formatoMoneda, formatoFecha } from '../utils/format';

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
  const navigate = useNavigate();

  async function cargar() {
    try {
      setRutas(await database.listarRutas());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const hayRutaActiva = rutas.some((r) => r.estado === 'EN_CURSO');

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Rutas</h1>
        {!hayRutaActiva && (
          <button className="boton-secundario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Iniciar ruta'}
          </button>
        )}
      </header>

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && (
        <FormIniciarRuta
          onIniciada={(id) => {
            setMostrarForm(false);
            navigate(`/rutas/${id}`);
          }}
        />
      )}

      <ul className="lista-rutas">
        {rutas.map((r) => (
          <li key={r.id}>
            <Link to={`/rutas/${r.id}`} className="tarjeta-ruta">
              <div>
                <strong>{r.tipo}</strong>
                <div className="detalle-cliente">{formatoFecha(r.fecha)} · {ETIQUETA_ESTADO[r.estado]}</div>
              </div>
              <div className="lado-derecho-cliente">
                <span>{r.vendidos}/{r.paquetes_llevados} vendidos</span>
                <span>{formatoMoneda(r.total_vendido)}</span>
              </div>
            </Link>
          </li>
        ))}
        {rutas.length === 0 && <p className="texto-vacio">Todavía no has registrado rutas.</p>}
      </ul>
    </div>
  );
}

function FormIniciarRuta({ onIniciada }: { onIniciada: (id: number) => void }) {
  const [tipo, setTipo] = useState<TipoRuta>('Puerta a puerta');
  const [paquetes, setPaquetes] = useState(20);
  const [usarGps, setUsarGps] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;

      if (usarGps && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 30000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // GPS es opcional: la ruta puede iniciar sin ubicación.
        }
      }

      const id = await database.iniciarRuta({
        tipo,
        paquetes_llevados: paquetes,
        lat_inicio: lat,
        lng_inicio: lng,
      });
      onIniciada(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={iniciar}>
      <label>
        Tipo de ruta
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRuta)}>
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label>
        ¿Cuántos paquetes llevas?
        <input type="number" min={1} step={1} value={paquetes} onChange={(e) => setPaquetes(Number(e.target.value))} required />
      </label>
      <label className="fila-checkbox">
        <input type="checkbox" checked={usarGps} onChange={(e) => setUsarGps(e.target.checked)} />
        Registrar ubicación de inicio con GPS
      </label>
      {error && <p className="texto-error">{error}</p>}
      <button type="submit" className="boton-primario" disabled={guardando}>
        {guardando ? 'Iniciando…' : '🧭 Iniciar ruta'}
      </button>
    </form>
  );
}
