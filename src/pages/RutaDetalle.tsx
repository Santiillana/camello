import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { database } from '../db/database';
import type { PedidoConDetalle, RutaConResumen, Venta } from '../types';
import { formatoFecha, formatoMoneda } from '../utils/format';

export default function RutaDetalle() {
  const { id } = useParams();
  const rutaId = Number(id);
  const navigate = useNavigate();
  const [ruta, setRuta] = useState<RutaConResumen | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([]);
  const [procesandoPedido, setProcesandoPedido] = useState<number | null>(null);
  const [sobrantes, setSobrantes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function cargar() {
    if (!Number.isInteger(rutaId) || rutaId <= 0) {
      setError('Ruta inválida.');
      return;
    }
    try {
      const [rutas, vs, ps] = await Promise.all([
        database.listarRutas(),
        database.listarVentasPorRuta(rutaId),
        database.listarPedidos({ rutaId }),
      ]);
      const r = rutas.find((x) => x.id === rutaId) ?? null;
      setRuta(r);
      setVentas(vs);
      setPedidos(ps);
      if (r) setSobrantes(String(r.paquetes_sobrantes ?? Math.max(r.paquetes_llevados - r.vendidos, 0)));
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
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: true,
              maximumAge: 0,
              timeout: 10000,
            }),
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // La ubicación de cierre es opcional.
        }
      }
      await database.finalizarRuta(rutaId, {
        lat_fin: lat,
        lng_fin: lng,
        paquetes_sobrantes: Number(sobrantes),
      });
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  if (!ruta && !error) return <div className="pantalla">Cargando…</div>;
  if (!ruta) {
    return (
      <div className="pantalla">
        <p className="texto-error">{error}</p>
        <button className="enlace-volver" onClick={() => navigate('/rutas')}>← Volver a rutas</button>
      </div>
    );
  }

  const enCurso = ruta.estado === 'EN_CURSO';
  const vendidos = ruta.vendidos;
  const disponibles = Math.max(ruta.paquetes_llevados - vendidos, 0);
  const diferencia = ruta.paquetes_llevados - vendidos - Number(sobrantes || 0);
  const pendientesEntrega = ruta.tipo === 'Entrega de pedidos' && pedidos.some((pedido) => pedido.estado === 'ASIGNADO');

  return (
    <div className="pantalla">
      <button className="enlace-volver" onClick={() => navigate(-1)}>← Volver</button>

      <header className="encabezado">
        <div>
          <p className="texto-kicker">Ruta</p>
          <h1>{ruta.nombre || ruta.tipo}</h1>
          <div className="detalle-cliente">{ruta.tipo} · {formatoFecha(ruta.fecha)}</div>
        </div>
        <span className={'etiqueta-seguimiento ' + (enCurso ? 'activo' : 'inactivo')}>
          {enCurso ? 'En curso' : ruta.estado === 'FINALIZADA' ? 'Finalizada' : ruta.estado}
        </span>
      </header>

      {error && <p className="texto-error">{error}</p>}

      <section className="grid-stats">
        <StatCard etiqueta="Llevados" valor={String(ruta.paquetes_llevados)} />
        <StatCard etiqueta="Vendidos" valor={String(vendidos)} />
        <StatCard etiqueta="Disponibles" valor={String(disponibles)} />
        <StatCard etiqueta="Cobrado" valor={formatoMoneda(ruta.cobrado ?? 0)} />
        <StatCard etiqueta="Fiado" valor={formatoMoneda(ruta.fiado ?? ruta.total_pendiente)} alerta={(ruta.fiado ?? ruta.total_pendiente) > 0} />
        <StatCard etiqueta="Utilidad" valor={formatoMoneda(ruta.utilidad)} />
        <StatCard etiqueta="Ticket promedio" valor={formatoMoneda(ruta.ticket_promedio ?? 0)} />
        <StatCard etiqueta="Ventas/hora" valor={String((ruta.ventas_por_hora ?? 0).toFixed(1))} />
        <StatCard etiqueta="Nuevos" valor={String(ruta.clientes_nuevos)} />
        <StatCard etiqueta="Recompra" valor={String(ruta.clientes_recompran ?? 0)} />
      </section>

      {enCurso && (
        <Link to="/venta-nueva" className="boton-primario boton-grande">
          ➕ Nueva venta
        </Link>
      )}

      {ruta.tipo === 'Entrega de pedidos' && (
        <section className="tarjeta">
          <div className="fila-titulo-boton">
            <div>
              <p className="texto-kicker">Entrega de pedidos</p>
              <h2>Paradas de hoy</h2>
            </div>
            <span className="detalle-cliente">{pedidos.filter((p) => p.estado === 'ENTREGADO').length} entregados · {pedidos.filter((p) => p.estado === 'ASIGNADO').length} pendientes</span>
          </div>
          {pedidos.length === 0 ? <p className="texto-vacio">No hay pedidos asignados a esta ruta.</p> : (
            <ol className="lista-seleccion-clientes">
              {pedidos.map((pedido) => (
                <li key={pedido.id} className="pedido-entrega-card">
                  <div>
                    <strong>{pedido.orden_entrega ?? '—'}. {pedido.cliente_nombre}</strong>
                    <span>{pedido.items.map((item) => item.producto_nombre + ' × ' + item.cantidad).join(', ')}</span>
                    <span>{formatoMoneda(pedido.total_estimado)} · {pedido.estado === 'ASIGNADO' ? 'Pendiente' : pedido.estado === 'ENTREGADO' ? (pedido.pago_estado === 'FIADO' ? 'Fiado' : 'Cobrado') : 'No entregado'}</span>
                  </div>
                  {enCurso && pedido.estado === 'ASIGNADO' && (
                    <div className="fila-botones">
                      <button type="button" className="boton-chip" disabled={procesandoPedido===pedido.id} onClick={async()=>{setProcesandoPedido(pedido.id);try{await database.registrarEntregaPedido(pedido.id,'EFECTIVO');await cargar();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setProcesandoPedido(null);}}}>Cobrado efectivo</button>
                      <button type="button" className="boton-chip" disabled={procesandoPedido===pedido.id} onClick={async()=>{setProcesandoPedido(pedido.id);try{await database.registrarEntregaPedido(pedido.id,'TRANSFERENCIA_NEQUI');await cargar();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setProcesandoPedido(null);}}}>Cobrado transferencia</button>
                      <button type="button" className="boton-chip" disabled={procesandoPedido===pedido.id} onClick={async()=>{setProcesandoPedido(pedido.id);try{await database.registrarEntregaPedido(pedido.id,'FIADO');await cargar();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setProcesandoPedido(null);}}}>Entregado fiado</button>
                      <button type="button" className="boton-texto peligro-texto" disabled={procesandoPedido===pedido.id} onClick={async()=>{const nota=window.prompt('Motivo o nota de no entrega','');setProcesandoPedido(pedido.id);try{await database.marcarPedidoNoEntregado(pedido.id,nota||undefined);await cargar();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setProcesandoPedido(null);}}}>No entregado</button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )};

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Cuadre</p>
            <h2>Inventario de ruta</h2>
          </div>
          <span className={'etiqueta-estado' + (diferencia === 0 ? '' : ' pendiente')}>{diferencia}</span>
        </div>
        <div className="lista-resumen">
          <div><span>Llevados</span><strong>{ruta.paquetes_llevados}</strong></div>
          <div><span>Vendidos</span><strong>{vendidos}</strong></div>
          <div><span>Sobrantes</span><strong>{sobrantes || '0'}</strong></div>
          <div><span>Diferencia</span><strong>{diferencia}</strong></div>
        </div>
        {enCurso && (
          <>
            <label>
              Paquetes sobrantes
              <input
                type="number"
                min={0}
                max={disponibles}
                step={1}
                value={sobrantes}
                onChange={(e) => setSobrantes(e.target.value)}
              />
            </label>
            <p className="texto-vacio">El cierre exige diferencia 0.</p>
            <button
              className="boton-peligro"
              onClick={() => void finalizar()}
              disabled={procesando || diferencia !== 0 || pendientesEntrega}
            >
              {procesando ? 'Finalizando…' : pendientesEntrega ? 'Resuelve los pedidos antes de cerrar' : 'Cerrar ruta y cuadrar'}
            </button>
          </>
        )}
      </section>

      <section>
        <div className="fila-titulo-boton">
          <h2>Historial de ventas</h2>
          <span className="detalle-cliente">{ventas.length} venta(s)</span>
        </div>
        {ventas.length === 0 && <p className="texto-vacio">Todavía no hay ventas en esta ruta.</p>}
        <ul className="lista-ventas">
          {ventas.map((v) => (
            <li key={v.id} className="fila-venta">
              <div>
                <strong>{v.producto_nombre}</strong> × {v.cantidad}
                <div className="detalle-cliente">{formatoFecha(v.fecha)} · {v.hora}</div>
              </div>
              <div className="lado-derecho-cliente">
                <span>{formatoMoneda(v.total)}</span>
                <Link className="boton-chip" to={'/clientes/' + v.cliente_id}>Ver cliente</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
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
