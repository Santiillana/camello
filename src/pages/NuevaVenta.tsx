import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen, Producto, Ruta } from '../types';
import { formatoMoneda } from '../utils/format';

export default function NuevaVenta() {
  const navigate = useNavigate();
  const location = useLocation();
  const clienteIdInicial = (location.state as { clienteId?: number } | null)?.clienteId;

  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [rutaActiva, setRutaActiva] = useState<Ruta | null>(null);
  const [clienteId, setClienteId] = useState<number | ''>(clienteIdInicial ?? '');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [productoId, setProductoId] = useState<number | ''>('');
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState(0);
  const [costo, setCosto] = useState(0);
  const [pagada, setPagada] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      database.listarClientes({ soloActivos: true }),
      database.listarProductos(),
      database.obtenerRutaActiva(),
    ]).then(([cs, ps, ruta]) => {
      setClientes(cs);
      setProductos(ps);
      setRutaActiva(ruta);
      if (ps[0]) {
        setProductoId(ps[0].id);
        setPrecio(ps[0].precio);
        setCosto(ps[0].costo);
      }
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function seleccionarProducto(id: number) {
    setProductoId(id);
    const p = productos.find((x) => x.id === id);
    if (p) {
      setPrecio(p.precio);
      setCosto(p.costo);
    }
  }

  const clientesFiltrados = busquedaCliente
    ? clientes.filter((c) => c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()))
    : clientes;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmacion(null);

    if (!clienteId || !productoId) {
      setError('Selecciona un cliente y un producto.');
      return;
    }

    const producto = productos.find((p) => p.id === productoId);
    if (!producto) {
      setError('El producto seleccionado ya no está disponible.');
      return;
    }

    setGuardando(true);
    try {
      await database.registrarVenta({
        cliente_id: Number(clienteId),
        ruta_id: rutaActiva?.id ?? null,
        producto_nombre: producto.nombre,
        cantidad,
        precio_aplicado: precio,
        costo_aplicado: costo,
        estado_pago: pagada ? 'PAGADA' : 'PENDIENTE',
      });
      setConfirmacion(`✓ Venta registrada por ${formatoMoneda(precio * cantidad)}`);
      window.setTimeout(() => {
        if (rutaActiva) navigate(`/rutas/${rutaActiva.id}`);
        else navigate(`/clientes/${clienteId}`);
      }, 700);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Nueva venta</h1>
      </header>

      {rutaActiva && <p className="banner-info">🧭 Se asociará a la ruta en curso</p>}
      {confirmacion && <p className="banner-exito">{confirmacion}</p>}
      {error && <p className="texto-error">{error}</p>}
      {productos.length === 0 && <p className="texto-vacio">No hay productos activos registrados.</p>}

      <form className="formulario" onSubmit={guardar}>
        <label>
          Cliente
          {!clienteId && (
            <input placeholder="Buscar cliente…" value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} />
          )}
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')} required>
            <option value="" disabled>Selecciona un cliente…</option>
            {clientesFiltrados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>

        <label>
          Producto
          <select value={productoId} onChange={(e) => seleccionarProducto(Number(e.target.value))} required disabled={!productos.length}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {formatoMoneda(p.precio)}</option>)}
          </select>
        </label>

        <label>
          Cantidad
          <input type="number" min={1} step={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} required />
        </label>

        <label>
          Precio aplicado
          <input type="number" min={0} step={1} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} required />
        </label>

        <label className="fila-checkbox">
          <input type="checkbox" checked={pagada} onChange={(e) => setPagada(e.target.checked)} />
          Pagada de una vez
        </label>

        <div className="resumen-total">Total: {formatoMoneda(Math.max(0, precio * cantidad))}</div>

        <button type="submit" className="boton-primario" disabled={guardando || !clienteId || !productoId || productos.length === 0}>
          {guardando ? 'Guardando…' : 'Registrar venta'}
        </button>
      </form>
    </div>
  );
}
