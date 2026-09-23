import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { database } from '../db/database';
import type { RutaConResumen, Venta } from '../types';
import { formatoMoneda } from '../utils/format';

export default function RutaDetalle() {
  const { id } = useParams();
  const rutaId = Number(id);
  const navigate = useNavigate();
  const [ruta, setRuta] = useState<RutaConResumen | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function cargar() {
    if (!Number.isInteger(rutaId) || rutaId <= 0) {
      setError('Ruta inválida.');
      return;
    }
    try {
      const rutas = await database.listarRutas();
      const r = rutas.find((x) => x.id === rutaId) ?? null;
      setRuta(r);
      setVentas(await database.listarVentasPorRuta(rutaId));
      if (!r) setError('No se encontró la ruta.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, [rutaId]);

  async function finalizar() {
    setProcesando(true);
    setError(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 30000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // La ubicación de cierre es opcional.
        }
      }
      await database.finalizarRuta(rutaId, { lat_fin: lat, lng_fin: lng });
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  if (!ruta && !error) return <div className="pantalla">Cargando…</div>;
  if (!ruta) return <div className="pantalla"><p className="texto-error">{error}</p><button className="enlace-volver" onClick={() => navigate('/rutas')}>← Volver a rutas</button></div>;

  const enCurso = ruta.estado === 'EN_CURSO';
  const programada = ruta.estado === 'PROGRAMADA';

  return (
    <div className="pantalla">
      <button className="enlace-volver" onClick={() => navigate(-1)}>← Volver</button>
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Ruta</p>
          <h1>{ruta.nombre || ruta.tipo}</h1>
          <div className="detalle-cliente">{ruta.tipo} · {ruta.fecha_planificada || ruta.fecha}</div>
        </div>
        <span className={'etiqueta-seguimiento ' + (enCurso ? 'activo' : 'inactivo')}>
          {enCurso ? 'En curso' : ruta.estado}
        </span>
      </header>

      {error && <p className="texto-error">{error}</p>}

      <section className="grid-stats">
        <StatCard etiqueta="Llevados" valor={String(ruta.paquetes_llevados)} />
        <StatCard etiqueta="Vendidos" valor={String(ruta.vendidos)} />
        <StatCard etiqueta="Disponibles" valor={String(ruta.disponibles)} />
        <StatCard etiqueta="Total vendido" valor={formatoMoneda(ruta.total_vendido)} />
        <StatCard etiqueta="Pendiente" valor={formatoMoneda(ruta.total_pendiente)} alerta={ruta.total_pendiente > 0} />
        <StatCard etiqueta="Clientes atendidos" valor={String(ruta.clientes_atendidos)} />
      </section>

      {programada && (
        <button
          className="boton-primario boton-grande"
          onClick={async () => {
            try {
              let lat: number | undefined;
              let lng: number | undefined;
              if (navigator.geolocation) {
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
              await database.iniciarRutaProgramada(rutaId, { lat_inicio: lat, lng_inicio: lng });
              await cargar();
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          ▶ Iniciar ruta
        </button>
      )}

      {enCurso && <Link to="/venta-nueva" className="boton-primario boton-grande">➕ Registrar venta</Link>}

      <section>
        <h2>Ventas de esta ruta</h2>
        {ventas.length === 0 && <p className="texto-vacio">Todavía no hay ventas en esta ruta.</p>}
        <ul className="lista-ventas">
          {ventas.map((v) => (
            <li key={v.id} className="fila-venta">
              <div><strong>{v.producto_nombre}</strong> × {v.cantidad}<div className="detalle-cliente">{v.hora}</div></div>
              <span>{formatoMoneda(v.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      {enCurso && (
        <button className="boton-peligro" onClick={() => void finalizar()} disabled={procesando}>
          {procesando ? 'Finalizando…' : 'Finalizar ruta'}
        </button>
      )}
    </div>
  );
}

function StatCard({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return <div className={'stat-card' + (alerta ? ' alerta' : '')}><span className="stat-valor">{valor}</span><span className="stat-etiqueta">{etiqueta}</span></div>;
}
