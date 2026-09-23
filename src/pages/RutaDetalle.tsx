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

  async function cargar() {
    const rutas = await database.listarRutas();
    const r = rutas.find((x) => x.id === rutaId) ?? null;
    setRuta(r);
    setVentas(await database.listarVentasPorRuta(rutaId));
  }

  useEffect(() => {
    cargar();
  }, [rutaId]);

  if (!ruta) return <div className="pantalla">Cargando…</div>;

  const enCurso = ruta.estado === 'EN_CURSO';

  async function finalizar() {
    let lat: number | undefined;
    let lng: number | undefined;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // sin ubicación de cierre si no hay permiso/señal
      }
    }
    await database.finalizarRuta(rutaId, { lat_fin: lat, lng_fin: lng });
    cargar();
  }

  return (
    <div className="pantalla">
      <button className="enlace-volver" onClick={() => navigate(-1)}>← Volver</button>

      <header className="encabezado">
        <h1>{ruta.tipo}</h1>
        <span className={'etiqueta-seguimiento ' + (enCurso ? 'activo' : 'inactivo')}>
          {enCurso ? 'En curso' : ruta.estado}
        </span>
      </header>

      <section className="grid-stats">
        <StatCard etiqueta="Llevados" valor={String(ruta.paquetes_llevados)} />
        <StatCard etiqueta="Vendidos" valor={String(ruta.vendidos)} />
        <StatCard etiqueta="Disponibles" valor={String(ruta.disponibles)} />
        <StatCard etiqueta="Total vendido" valor={formatoMoneda(ruta.total_vendido)} />
        <StatCard etiqueta="Pendiente" valor={formatoMoneda(ruta.total_pendiente)} alerta={ruta.total_pendiente > 0} />
        <StatCard etiqueta="Clientes atendidos" valor={String(ruta.clientes_atendidos)} />
      </section>

      {enCurso && (
        <Link to="/venta-nueva" className="boton-primario boton-grande">➕ Registrar venta</Link>
      )}

      <section>
        <h2>Ventas de esta ruta</h2>
        {ventas.length === 0 && <p className="texto-vacio">Todavía no hay ventas en esta ruta.</p>}
        <ul className="lista-ventas">
          {ventas.map((v) => (
            <li key={v.id} className="fila-venta">
              <div>
                <strong>{v.producto_nombre}</strong> × {v.cantidad}
                <div className="detalle-cliente">{v.hora}</div>
              </div>
              <span>{formatoMoneda(v.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      {enCurso && (
        <button className="boton-peligro" onClick={finalizar}>
          Finalizar ruta
        </button>
      )}
    </div>
  );
}

function StatCard({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={'stat-card' + (alerta ? ' alerta' : '')}>
      <span className="stat-valor">{valor}</span>
      <span className="stat-etiqueta">{etiqueta}</span>
    </div>
  );
}
