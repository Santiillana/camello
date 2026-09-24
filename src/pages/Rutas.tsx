import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { RutaConResumen, TipoRuta } from '../types';
import { formatoFecha, formatoMoneda } from '../utils/format';

const TIPOS: TipoRuta[] = ['Puerta a puerta', 'Venta local móvil'];
const ETIQUETA_ESTADO: Record<string, string> = {
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  PROGRAMADA: 'Pendiente',
};

export default function Rutas() {
  const [rutas, setRutas] = useState<RutaConResumen[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      setRutas(await database.listarRutas());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const rutaActiva = rutas.find((r) => r.estado === 'EN_CURSO') ?? null;

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Recorridos comerciales</p>
          <h1>Rutas</h1>
        </div>
        {!rutaActiva && (
          <button className="boton-primario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Nueva ruta'}
          </button>
        )}
      </header>

      {rutaActiva && (
        <Link to={'/rutas/' + rutaActiva.id} className="banner-ruta-activa">
          🧭 Ruta en curso · {rutaActiva.nombre || rutaActiva.tipo}
        </Link>
      )}

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && !rutaActiva && (
        <FormNuevaRuta
          onCreada={async (id) => {
            setMostrarForm(false);
            await cargar();
            window.location.hash = '#/rutas/' + id;
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
                  {ruta.tipo} · {formatoFecha(ruta.fecha)} · {ETIQUETA_ESTADO[ruta.estado] ?? ruta.estado}
                </div>
                <div className="detalle-cliente">
                  {ruta.vendidos} vendidos · {ruta.clientes_atendidos} clientes · {formatoMoneda(ruta.total_vendido)}
                </div>
              </div>
              <div className="lado-derecho-cliente">
                <strong>{ruta.estado === 'EN_CURSO' ? 'Abierta' : formatoMoneda(ruta.total_vendido)}</strong>
                {ruta.estado === 'FINALIZADA' && (
                  <span className="detalle-cliente">{ruta.paquetes_sobrantes ?? ruta.sobrantes} sobrantes</span>
                )}
              </div>
            </Link>
            {ruta.estado === 'EN_CURSO' && (
              <Link className="boton-primario boton-grande" to={'/rutas/' + ruta.id}>
                Continuar ruta
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
  onCreada: (id: number) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('Ruta de hoy');
  const [tipo, setTipo] = useState<TipoRuta>('Puerta a puerta');
  const [paquetes, setPaquetes] = useState(20);
  const [usarGps, setUsarGps] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);

    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (usarGps && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 10000,
            }),
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // La ubicación de inicio es opcional.
        }
      }

      const id = await database.iniciarRuta({
        nombre,
        tipo,
        paquetes_llevados: paquetes,
        lat_inicio: lat,
        lng_inicio: lng,
      });
      await onCreada(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <div className="separador-seccion">
        <strong>Iniciar ruta ahora</strong>
        <span className="texto-vacio">La ruta queda guardada y continúa aunque cierres la app.</span>
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

      <label>
        ¿Cuántos paquetes llevas?
        <input type="number" min={1} step={1} value={paquetes} onChange={(e) => setPaquetes(Number(e.target.value))} required />
      </label>

      <label className="fila-checkbox">
        <input type="checkbox" checked={usarGps} onChange={(e) => setUsarGps(e.target.checked)} />
        Registrar ubicación de inicio con GPS
      </label>

      {error && <p className="texto-error">{error}</p>}

      <div className="fila-botones">
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="boton-primario boton-grande" disabled={guardando}>
          {guardando ? 'Iniciando…' : '▶ Iniciar ruta'}
        </button>
      </div>
    </form>
  );
}
