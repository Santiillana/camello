import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  useEffect(() => {
    database.listarClientes({ soloActivos: true }).then(setClientes);
    database.listarProductos().then((ps) => {
      setProductos(ps);
      if (ps[0]) {
        setProductoId(ps[0].id);
        setPrecio(ps[0].precio);
        setCosto(ps[0].costo);
      }
    });
    database.obtenerRutaActiva().then(setRutaActiva);
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
    if (!clienteId || !productoId) return;
    setGuardando(true);
    const producto = productos.find((p) => p.id === productoId)!;
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
      setGuardando(false);
      setConfirmacion(`✓ Venta registrada por ${formatoMoneda(precio * cantidad)}`);
    setTimeout(() => {
      if (rutaActiva) navigate(`/rutas/${rutaActiva.id}`);
      else navigate(`/clientes/${clienteId}`);
      }, 900);
    } catch (e) {
      setGuardando(false);
      setConfirmacion(`Error: ${String(e instanceof Error ? e.message : e)}`);
    }
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Nueva venta</h1>
      </header>

      {rutaActiva && <p className="banner-info">🧭 Se asociará a la ruta en curso</p>}
      {confirmacion && <p className="banner-exito">{confirmacion}</p>}

      <form className="formulario" onSubmit={guardar}>
        <label>
          Cliente
          {!clienteId && (
            <input
              placeholder="Buscar cliente…"
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
            />
          )}
          <select value={clienteId} onChange={(e) => setClienteId(Number(e.target.value))} required>
            <option value="" disabled>Selecciona un cliente…</option>
            {clientesFiltrados.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>

        <label>
          Producto
          <select value={productoId} onChange={(e) => seleccionarProducto(Number(e.target.value))} required>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} — {formatoMoneda(p.precio)}</option>
            ))}
          </select>
        </label>

        <label>
          Cantidad
          <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
        </label>

        <label>
          Precio aplicado (editable)
          <input type="number" min={0} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} />
        </label>

        <label className="fila-checkbox">
          <input type="checkbox" checked={pagada} onChange={(e) => setPagada(e.target.checked)} />
          Pagada de una vez
        </label>

        <div className="resumen-total">Total: {formatoMoneda(precio * cantidad)}</div>

        <button type="submit" className="boton-primario" disabled={guardando || !clienteId}>
          {guardando ? 'Guardando…' : 'Registrar venta'}
        </button>
      </form>
    </div>
  );
}
