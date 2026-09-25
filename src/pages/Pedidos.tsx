import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen, PedidoConDetalle, Producto } from '../types';
import { formatoMoneda, hoyISO } from '../utils/format';

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

  const pedidosDelDia = useMemo(
    () => pedidos.filter((pedido) => pedido.fecha_entrega === fechaEntrega && pedido.estado !== 'CANCELADO'),
    [pedidos, fechaEntrega],
  );
  const pendientesSinRuta = pedidosDelDia.filter((pedido) => pedido.ruta_id == null && pedido.estado === 'PENDIENTE');

  async function cargarPedidos() {
    try {
      setPedidos(await database.listarPedidos());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function cargarClientes() {
    try {
      const resultado = await database.listarClientes({ soloActivos: true, texto: busquedaCliente, limite: 50, offset: 0 });
      setClientes((actuales) => {
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
      await cargar();
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
            {pedidosDelDia.map((pedido) => (
              <li key={pedido.id} className="pedido-entrega-card">
                <div>
                  <strong>{pedido.cliente_nombre}</strong>
                  <span>{pedido.items.map((item) => item.producto_nombre + ' × ' + item.cantidad).join(', ')}</span>
                  <span>{formatoMoneda(pedido.total_estimado)} · {pedido.estado}</span>
                </div>
                <span className="etiqueta-estado">{pedido.ruta_id ? 'Ruta asignada' : 'Sin ruta'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}
