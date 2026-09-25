import { useEffect, useMemo, useState } from 'react';
import { database } from '../db/database';
import type { ClienteConResumen, PedidoConDetalle, Producto } from '../types';
import { formatoMoneda, hoyISO } from '../utils/format';

type Periodo = 'dia' | 'semana' | 'mes';

function fechaDesdePeriodo(periodo: Periodo, hoy: string): string {
  const d = new Date(hoy + 'T00:00:00');
  if (periodo === 'dia') return hoy;
  if (periodo === 'mes') return hoy.slice(0, 7) + '-01';
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([]);
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(hoyISO());
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [entregando, setEntregando] = useState<number | null>(null);

  async function cargar() {
    try {
      const [ps, cs, prods] = await Promise.all([
        database.listarPedidos(),
        database.listarClientes({ soloActivos: true, limite: 2000 }),
        database.listarProductos({}),
      ]);
      setPedidos(ps);
      setClientes(cs);
      setProductos(prods.filter((p) => p.activo === 1));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const pendientes = useMemo(
    () => pedidos.filter((p) => p.estado === 'PENDIENTE' || p.estado === 'ASIGNADO').sort((a,b) => a.fecha_entrega.localeCompare(b.fecha_entrega) || a.id-b.id),
    [pedidos],
  );
  const historial = useMemo(() => pedidos.filter((p) => p.estado === 'ENTREGADO'), [pedidos]);
  const vencidos = useMemo(() => pendientes.filter((p) => p.fecha_entrega < hoyISO()), [pendientes]);

  const metricas = useMemo(() => {
    const desde = fechaDesdePeriodo(periodo, hoyISO());
    const filas = historial.filter((p) => (p.entregado_at?.slice(0,10) ?? p.fecha_entrega) >= desde && (p.entregado_at?.slice(0,10) ?? p.fecha_entrega) <= hoyISO());
    return {
      pedidos: filas.length,
      total: filas.reduce((s,p)=>s+p.total_estimado,0),
      cobrado: filas.filter(p=>p.pago_estado==='COBRADO').reduce((s,p)=>s+p.total_estimado,0),
      fiado: filas.filter(p=>p.pago_estado==='FIADO').reduce((s,p)=>s+p.total_estimado,0),
    };
  }, [historial, periodo]);

  async function crear() {
    const pid = Number(productoId);
    const qty = Number(cantidad);
    if (!clienteId || !Number.isInteger(pid) || pid <= 0 || !Number.isInteger(qty) || qty <= 0) {
      setError('Selecciona cliente, producto y cantidad válida.');
      return;
    }
    setGuardando(true); setError(null);
    try {
      await database.crearPedido({ cliente_id: Number(clienteId), fecha_entrega: fechaEntrega, notas: nota, items: [{ producto_id: pid, cantidad: qty }] });
      setClienteId(''); setProductoId(''); setCantidad('1'); setNota('');
      await cargar();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setGuardando(false); }
  }

  async function entregar(pedidoId: number, metodo: 'EFECTIVO'|'TRANSFERENCIA_NEQUI'|'FIADO') {
    setEntregando(pedidoId); setError(null);
    try { await database.registrarEntregaPedido(pedidoId, metodo); await cargar(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setEntregando(null); }
  }

  async function reagendar(pedido: PedidoConDetalle) {
    const nueva = window.prompt('Nueva fecha de entrega (AAAA-MM-DD):', fechaEntrega);
    if (!nueva) return;
    setError(null);
    try { await database.reagendarPedido(pedido.id, nueva); await cargar(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div><p className="texto-kicker">WhatsApp → Entrega</p><h1>Pedidos</h1></div>
      </header>

      <section className="tarjeta">
        <h2>Registrar pedido</h2>
        <p className="texto-vacio">Un pedido es un pre-agendamiento. El método de pago se decide cuando realmente se entrega.</p>
        <div className="grid-dos-columnas">
          <label>Cliente<select value={clienteId} onChange={(e)=>setClienteId(e.target.value)}>
            <option value="">Selecciona</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></label>
          <label>Entregar el<input type="date" value={fechaEntrega} onChange={(e)=>setFechaEntrega(e.target.value)} /></label>
        </div>
        <div className="grid-dos-columnas">
          <label>Producto<select value={productoId} onChange={(e)=>setProductoId(e.target.value)}>
            <option value="">Selecciona</option>
            {productos.map(p=><option key={p.id} value={p.id}>{p.nombre} · {formatoMoneda(p.precio)}</option>)}
          </select></label>
          <label>Cantidad<input type="number" min={1} step={1} value={cantidad} onChange={(e)=>setCantidad(e.target.value)} inputMode="numeric" /></label>
        </div>
        <label>Nota / referencia<textarea rows={3} value={nota} onChange={(e)=>setNota(e.target.value)} /></label>
        <button type="button" className="boton-primario boton-grande" disabled={guardando} onClick={()=>void crear()}>{guardando?'Guardando…':'Guardar pedido'}</button>
      </section>

      {vencidos.length > 0 && <section className="tarjeta tarjeta-alerta">
        <p className="texto-kicker">Atención</p>
        <h2>{vencidos.length} pedido(s) vencido(s)</h2>
        <ul className="lista-resumen">{vencidos.map(p=><li key={p.id} className="pedido-entrega-card">
          <div><strong>{p.cliente_nombre}</strong><span>{p.fecha_entrega} · {formatoMoneda(p.total_estimado)}</span></div>
          <button className="boton-secundario" onClick={()=>void reagendar(p)}>Reagendar</button>
        </li>)}</ul>
      </section>}

      <section className="tarjeta">
        <div className="fila-titulo-boton"><div><p className="texto-kicker">Planificación</p><h2>Pendientes por entregar</h2></div><span className="detalle-cliente">{pendientes.length} pendiente(s)</span></div>
        {pendientes.length===0 ? <p className="texto-vacio">No hay pedidos pendientes.</p> : <ul className="lista-resumen">{pendientes.map(p=><li key={p.id} className="pedido-entrega-card">
          <div><strong>{p.cliente_nombre}</strong><span>{p.items.map(i=>i.producto_nombre+' × '+i.cantidad).join(', ')}</span><span>{p.fecha_entrega} · {formatoMoneda(p.total_estimado)} · {p.ruta_id ? 'Ruta asignada' : 'Sin ruta'}</span></div>
          <div className="fila-botones">
            <button className="boton-chip" disabled={entregando===p.id} onClick={()=>void entregar(p.id,'EFECTIVO')}>Efectivo</button>
            <button className="boton-chip" disabled={entregando===p.id} onClick={()=>void entregar(p.id,'TRANSFERENCIA_NEQUI')}>Transferencia</button>
            <button className="boton-chip" disabled={entregando===p.id} onClick={()=>void entregar(p.id,'FIADO')}>Fiado</button>
            <button className="boton-texto" onClick={()=>void reagendar(p)}>Reagendar</button>
          </div>
        </li>)}</ul>}
      </section>

      <section className="tarjeta">
        <div className="fila-titulo-boton"><div><p className="texto-kicker">Métricas</p><h2>Pedidos entregados</h2></div>
          <div className="periodo-selector">{(['dia','semana','mes'] as Periodo[]).map(p=><button key={p} className={'periodo-tab'+(periodo===p?' activo':'')} onClick={()=>setPeriodo(p)}>{p==='dia'?'Día':p==='semana'?'Semana':'Mes'}</button>)}</div>
        </div>
        <div className="grid-stats">
          <div className="stat-card"><span className="stat-valor">{metricas.pedidos}</span><span className="stat-etiqueta">Pedidos</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.total)}</span><span className="stat-etiqueta">Generado</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.cobrado)}</span><span className="stat-etiqueta">Cobrado</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.fiado)}</span><span className="stat-etiqueta">Fiado</span></div>
        </div>
      </section>

      <section className="tarjeta">
        <div className="fila-titulo-boton"><div><p className="texto-kicker">Historial</p><h2>Pedidos entregados</h2></div><span className="detalle-cliente">{historial.length} acumulados</span></div>
        {historial.length===0 ? <p className="texto-vacio">Todavía no hay pedidos entregados.</p> : <ul className="lista-resumen">{historial.map(p=><li key={p.id} className="pedido-entrega-card">
          <div><strong>{p.cliente_nombre}</strong><span>{p.items.map(i=>i.producto_nombre+' × '+i.cantidad).join(', ')}</span><span>{p.entregado_at?.slice(0,16).replace('T',' ') ?? p.fecha_entrega} · {formatoMoneda(p.total_estimado)}</span></div>
          <span className="etiqueta-estado">{p.pago_estado === 'FIADO' ? 'Fiado' : 'Cobrado'}</span>
        </li>)}</ul>}
      </section>
      {error && <p className="texto-error" role="alert">{error}</p>}
    </div>
  );
}
