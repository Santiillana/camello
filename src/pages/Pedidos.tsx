import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen, PedidoConDetalle, Producto } from '../types';
import { formatoMoneda, hoyISO, inicioSemanaISO } from '../utils/format';

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([]);
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteConResumen | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState(hoyISO());
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [nota, setNota] = useState('');
  const [items, setItems] = useState<Array<{ producto_id: number; cantidad: number }>>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entregaPedidoId, setEntregaPedidoId] = useState<number | null>(null);
  const [metodoEntrega, setMetodoEntrega] = useState<'EFECTIVO' | 'TRANSFERENCIA_NEQUI' | 'FIADO'>('EFECTIVO');
  const [reagendarPedidoId, setReagendarPedidoId] = useState<number | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState(hoyISO());
  const [metricas, setMetricas] = useState({
    dia: { entregados: 0, cantidad: 0, valor: 0 },
    semana: { entregados: 0, cantidad: 0, valor: 0 },
    mes: { entregados: 0, cantidad: 0, valor: 0 },
  });

  const pedidosDelDia = useMemo(
    () => pedidos.filter((pedido) => pedido.fecha_entrega === fechaEntrega && pedido.estado !== 'CANCELADO'),
    [pedidos, fechaEntrega],
  );
  const pendientesSinRuta = pedidosDelDia.filter((pedido) => pedido.ruta_id == null && pedido.estado === 'PENDIENTE');

  async function cargarPedidos() {
    try {
      const fin = hoyISO();
      const inicioMes = fin.slice(0, 7) + '-01';
      const [lista, dia, semana, mes] = await Promise.all([
        database.listarPedidos(),
        database.resumenPedidosPeriodo(fin, fin),
        database.resumenPedidosPeriodo(inicioSemanaISO(), fin),
        database.resumenPedidosPeriodo(inicioMes, fin),
      ]);
      setPedidos(lista);
      setMetricas({ dia, semana, mes });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cargarClientes() {
    try {
      const resultado = await database.listarClientes({ soloActivos: true, texto: busquedaCliente, limite: 50, offset: 0 });
      setClientes(() => {
        const seleccionado = clienteSeleccionado && !resultado.some((c) => c.id === clienteSeleccionado.id) ? [clienteSeleccionado] : [];
        return [...seleccionado, ...resultado];
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargarPedidos(); }, []);
  useEffect(() => { void cargarClientes(); }, [busquedaCliente]);
  useEffect(() => {
    void database.listarProductos({}).then((prods) => setProductos(prods.filter((producto) => producto.activo === 1)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function entregarPedido() {
    if (entregaPedidoId == null || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await database.registrarEntregaPedido(entregaPedidoId, metodoEntrega);
      setEntregaPedidoId(null);
      await cargarPedidos();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function reagendar() {
    if (reagendarPedidoId == null || !nuevaFecha) return;
    setGuardando(true);
    setError(null);
    try {
      await database.reagendarPedido(reagendarPedidoId, nuevaFecha);
      setReagendarPedidoId(null);
      await cargarPedidos();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  function agregarItem() {
    const pid = Number(productoId);
    const qty = Number(cantidad);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(qty) || qty <= 0) {
      setError('Selecciona un producto y una cantidad válida.');
      return;
    }
    setItems((actual) => {
      const encontrado = actual.find((item) => item.producto_id === pid);
      return encontrado
        ? actual.map((item) => item.producto_id === pid ? { ...item, cantidad: item.cantidad + qty } : item)
        : [...actual, { producto_id: pid, cantidad: qty }];
    });
    setCantidad('1');
    setError(null);
  }

  async function crear() {
    if (!clienteId) {
      setError('Selecciona el cliente.');
      return;
    }
    if (!items.length) {
      setError('Agrega al menos un producto.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await database.crearPedido({
        cliente_id: Number(clienteId),
        fecha_entrega: fechaEntrega,
        notas: nota,
        items,
      });
      setItems([]);
      setNota('');
      setClienteId('');
      setClienteSeleccionado(null);
      setBusquedaCliente('');
      setProductoId('');
      await cargarPedidos();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">WhatsApp → Entrega</p>
          <h1>Pedidos</h1>
        </div>
      </header>

      <section className="tarjeta">
        <h2>Registrar pedido</h2>
        <p className="texto-vacio">Guarda los pedidos que vayan llegando y asígnalos después a la ruta del día.</p>
        <div className="grid-dos-columnas">
          <label>
            Buscar cliente o mascota
            <input value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} placeholder="Nombre o mascota…" autoComplete="off" />
            <small className="detalle-cliente">La búsqueda se realiza en SQLite y no está limitada a la primera página.</small>
          </label>
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => {
              const value = e.target.value;
              setClienteId(value);
              setClienteSeleccionado(value ? clientes.find((cliente) => String(cliente.id) === value) ?? null : null);
            }}>
              <option value="">Selecciona</option>
              {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}
            </select>
          </label>
          <label>
            Entregar el
            <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          </label>
        </div>

        <div className="grid-dos-columnas">
          <label>
            Producto
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">Selecciona</option>
              {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} · {formatoMoneda(producto.precio)}</option>)}
            </select>
          </label>
          <label>
            Cantidad
            <input type="number" min={1} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" />
          </label>
        </div>

        <button type="button" className="boton-secundario" onClick={agregarItem}>Agregar producto</button>

        {items.length > 0 && (
          <ul className="lista-resumen">
            {items.map((item) => (
              <li key={item.producto_id}>
                <span>{productos.find((producto) => producto.id === item.producto_id)?.nombre ?? 'Producto'} × {item.cantidad}</span>
                <button type="button" className="boton-texto peligro-texto" onClick={() => setItems((actual) => actual.filter((x) => x.producto_id !== item.producto_id))}>Quitar</button>
              </li>
            ))}
          </ul>
        )}

        <label>
          Nota / referencia
          <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. confirmar por WhatsApp" />
        </label>
        <button type="button" className="boton-primario boton-grande" disabled={guardando} onClick={() => void crear()}>
          {guardando ? 'Guardando…' : 'Guardar pedido'}
        </button>
      </section>

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Planificación</p>
            <h2>Pedidos del {fechaEntrega}</h2>
          </div>
          <div className="fila-botones">
            <span className="detalle-cliente">{pedidosDelDia.length} pedido(s)</span>
            {pendientesSinRuta.length > 0 && <Link to="/rutas?nuevo=1" className="boton-primario">Crear ruta de entrega</Link>}
          </div>
        </div>
        {pedidosDelDia.length === 0 ? (
          <p className="texto-vacio">No hay pedidos para esta fecha.</p>
        ) : (
          <ul className="lista-resumen">
            {pedidosDelDia.map((pedido) => {
              const vencido = pedido.estado === 'PENDIENTE' && pedido.fecha_entrega < hoyISO();
              return (
                <li key={pedido.id} className="pedido-entrega-card">
                  <div>
                    <strong>{pedido.cliente_nombre}</strong>
                    <span>{pedido.items.map((item) => item.producto_nombre + ' × ' + item.cantidad).join(', ')}</span>
                    <span>{formatoMoneda(pedido.total_estimado)} · {pedido.estado}</span>
                    {vencido && <span className="texto-alerta">Pedido vencido. Reagenda la entrega.</span>}
                  </div>
                  <div className="fila-botones">
                    <span className="etiqueta-estado">{pedido.ruta_id ? 'Ruta asignada' : 'Sin ruta'}</span>
                    {pedido.estado === 'PENDIENTE' && pedido.ruta_id == null && (
                      <>
                        <button type="button" className="boton-primario boton-chip-accion" onClick={() => setEntregaPedidoId(pedido.id)}>Entregar</button>
                        <button type="button" className="boton-secundario boton-chip-accion" onClick={() => { setReagendarPedidoId(pedido.id); setNuevaFecha(pedido.fecha_entrega); }}>Reagendar</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {entregaPedidoId != null && (
        <section className="tarjeta modal-flotante">
          <h2>Registrar entrega</h2>
          <p className="detalle-cliente">El método de pago se registra al entregar el pedido.</p>
          <div className="selector-estado-pago" role="group" aria-label="Método de pago de la entrega">
            <button type="button" className={'boton-estado-pago' + (metodoEntrega === 'EFECTIVO' ? ' activo' : '')} onClick={() => setMetodoEntrega('EFECTIVO')}>Efectivo</button>
            <button type="button" className={'boton-estado-pago' + (metodoEntrega === 'TRANSFERENCIA_NEQUI' ? ' activo' : '')} onClick={() => setMetodoEntrega('TRANSFERENCIA_NEQUI')}>Transferencia / Nequi</button>
            <button type="button" className={'boton-estado-pago' + (metodoEntrega === 'FIADO' ? ' activo' : '')} onClick={() => setMetodoEntrega('FIADO')}>Fiado</button>
          </div>
          <div className="fila-botones">
            <button type="button" className="boton-secundario" onClick={() => setEntregaPedidoId(null)} disabled={guardando}>Cancelar</button>
            <button type="button" className="boton-primario" onClick={() => void entregarPedido()} disabled={guardando}>{guardando ? 'Registrando…' : 'Confirmar entrega'}</button>
          </div>
        </section>
      )}
      {reagendarPedidoId != null && (
        <section className="tarjeta modal-flotante">
          <h2>Reagendar pedido</h2>
          <label>Nueva fecha<input type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} /></label>
          <div className="fila-botones">
            <button type="button" className="boton-secundario" onClick={() => setReagendarPedidoId(null)} disabled={guardando}>Cancelar</button>
            <button type="button" className="boton-primario" onClick={() => void reagendar()} disabled={guardando || !nuevaFecha}>Guardar fecha</button>
          </div>
        </section>
      )}
      <section className="tarjeta">
        <div className="fila-titulo-boton"><div><p className="texto-kicker">Métricas</p><h2>Pedidos entregados</h2></div></div>
        <div className="grid-stats">
          <div className="stat-card"><span className="stat-valor">{metricas.dia.entregados}</span><span className="stat-etiqueta">Hoy</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.semana.entregados}</span><span className="stat-etiqueta">Semana</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.mes.entregados}</span><span className="stat-etiqueta">Mes</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.mes.valor)}</span><span className="stat-etiqueta">Valor generado del mes</span></div>
        </div>
      </section>
      <section className="tarjeta">
        <div className="fila-titulo-boton"><div><p className="texto-kicker">Historial</p><h2>Pedidos acumulados</h2></div><span className="detalle-cliente">{pedidos.filter((pedido) => pedido.estado !== 'PENDIENTE' && pedido.estado !== 'ASIGNADO').length} resuelto(s)</span></div>
        {pedidos.filter((pedido) => pedido.estado !== 'PENDIENTE' && pedido.estado !== 'ASIGNADO').length === 0
          ? <p className="texto-vacio">Todavía no hay pedidos resueltos.</p>
          : <ul className="lista-resumen">{pedidos.filter((pedido) => pedido.estado !== 'PENDIENTE' && pedido.estado !== 'ASIGNADO').map((pedido) => (
            <li key={pedido.id}><div><strong>{pedido.cliente_nombre}</strong><span>{pedido.fecha_entrega} · {pedido.estado}</span><span>{pedido.items.map((item) => item.producto_nombre + ' × ' + item.cantidad).join(', ')}</span></div><strong>{formatoMoneda(pedido.total_estimado)}</strong></li>
          ))}</ul>}
      </section>
      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}
