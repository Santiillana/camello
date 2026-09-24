import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen, Producto, Ruta } from '../types';
import { fechaLocalISO, formatoMoneda, horaLocalHHMM } from '../utils/format';
import AsistenteTarjetas from '../components/AsistenteTarjetas';
import ClienteForm from '../components/ClienteForm';

type Metodo = 'EFECTIVO' | 'TRANSFERENCIA_NEQUI' | 'FIADO' | 'PARCIAL';

type Voucher = {
  id: number;
  cliente: string;
  producto: string;
  cantidad: number;
  total: number;
  pagado: number;
  pendiente: number;
  fecha: string;
  hora: string;
};

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
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [montoParcial, setMontoParcial] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const operacionIdRef = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([
      database.listarClientes({ soloActivos: true }),
      database.listarProductos(),
      database.obtenerRutaActiva(),
    ]).then(([cs, ps, ruta]) => {
      setClientes(cs);
      setProductos(ps);
      setRutaActiva(ruta);
      if (ps.length === 1) setProductoId(ps[0].id);
      else if (ps[0]) setProductoId(ps[0].id);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const producto = productos.find((p) => p.id === productoId);
  const cliente = clientes.find((c) => c.id === clienteId);
  const clientesFiltrados = useMemo(() => {
    const texto = busquedaCliente.trim().toLowerCase();
    if (!texto) return clientes;
    return clientes.filter((c) =>
      c.nombre.toLowerCase().includes(texto) ||
      c.mascotas.some((m) => m.nombre.toLowerCase().includes(texto)),
    );
  }, [clientes, busquedaCliente]);

  const total = producto ? producto.precio * cantidad : 0;
  const pagado = metodo === 'EFECTIVO' || metodo === 'TRANSFERENCIA_NEQUI'
    ? total
    : metodo === 'FIADO'
      ? 0
      : Number(montoParcial || 0);
  const pendiente = Math.max(0, total - pagado);

  const tarjetas = useMemo(() => [
    {
      id: 'cliente',
      titulo: 'Cliente',
      contenido: mostrarNuevoCliente ? (
        <ClienteForm
          textoBoton="Guardar y seleccionar"
          onGuardado={async (id) => {
            const nuevos = await database.listarClientes({ soloActivos: true });
            setClientes(nuevos);
            setClienteId(id);
            setBusquedaCliente('');
            setMostrarNuevoCliente(false);
          }}
          onCancelar={() => setMostrarNuevoCliente(false)}
        />
      ) : (
        <div className="formulario">
          <label>
            Buscar cliente o mascota
            <input value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} placeholder="Nombre o mascota…" />
          </label>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Selecciona un cliente…</option>
            {clientesFiltrados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="fila-botones">
            <button type="button" className="boton-secundario" onClick={() => setMostrarNuevoCliente(true)}>+ Nuevo cliente</button>
            {clienteId && (
              <a
                className="boton-secundario"
                target="_blank"
                rel="noreferrer"
                href={'#/clientes/' + clienteId}
              >
                Ver/editar cliente
              </a>
            )}
          </div>
        </div>
      ),
      validar: () => clienteId ? null : 'Selecciona un cliente.',
    },
    {
      id: 'producto',
      titulo: 'Producto',
      opcional: productos.length === 1,
      contenido: (
        <div className="formulario">
          {productos.length === 0 ? (
            <p className="texto-error">No hay productos activos. Registra uno en Configuración.</p>
          ) : (
            <label>
              Producto
              <select value={productoId} onChange={(e) => setProductoId(Number(e.target.value))}>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {formatoMoneda(p.precio)}</option>)}
              </select>
            </label>
          )}
        </div>
      ),
      validar: () => producto ? null : 'Selecciona un producto activo.',
    },
    {
      id: 'cantidad',
      titulo: 'Cantidad',
      contenido: (
        <div className="cantidad-grande">
          <button type="button" onClick={() => setCantidad((valor) => Math.max(1, valor - 1))}>−</button>
          <strong>{cantidad}</strong>
          <button type="button" onClick={() => setCantidad((valor) => valor + 1)}>+</button>
        </div>
      ),
      validar: () => Number.isInteger(cantidad) && cantidad > 0 ? null : 'La cantidad debe ser mayor que 0.',
    },
    {
      id: 'pago',
      titulo: 'Método de pago',
      contenido: (
        <div className="metodos-pago">
          {([
            ['EFECTIVO', 'Efectivo'],
            ['TRANSFERENCIA_NEQUI', 'Transferencia / Nequi'],
            ['FIADO', 'Fiado'],
            ['PARCIAL', 'Pago parcial'],
          ] as Array<[Metodo, string]>).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={'metodo-pago-card' + (metodo === id ? ' activo' : '')}
              onClick={() => setMetodo(id)}
            >
              <strong>{label}</strong>
              <span>{id === 'FIADO' ? '0 hoy' : id === 'PARCIAL' ? 'Define cuánto paga' : 'Pago completo'}</span>
            </button>
          ))}
          {metodo === 'PARCIAL' && (
            <label>
              ¿Cuánto paga ahora?
              <input
                type="number"
                min={1}
                max={Math.max(0, total - 1)}
                step={1}
                value={montoParcial}
                onChange={(e) => setMontoParcial(e.target.value)}
                inputMode="numeric"
              />
            </label>
          )}
        </div>
      ),
      validar: () => {
        if (metodo === 'PARCIAL') {
          const monto = Number(montoParcial);
          if (!Number.isInteger(monto) || monto <= 0 || monto >= total) return 'El pago parcial debe ser mayor que 0 y menor que el total.';
        }
        return null;
      },
    },
    {
      id: 'resumen',
      titulo: 'Resumen y confirmar',
      contenido: (
        <div className="resumen-venta">
          {rutaActiva && <p className="banner-info">🧭 Esta venta se asociará a la ruta en curso.</p>}
          {!rutaActiva && <p className="banner-info">Venta rápida: no está asociada a una ruta.</p>}
          <div className="lista-resumen">
            <div><span>Cliente</span><strong>{cliente?.nombre ?? '—'}</strong></div>
            <div><span>Producto</span><strong>{producto?.nombre ?? '—'}</strong></div>
            <div><span>Cantidad</span><strong>{cantidad}</strong></div>
            <div><span>Total</span><strong>{formatoMoneda(total)}</strong></div>
            <div><span>Pagado ahora</span><strong>{formatoMoneda(Math.max(0, pagado))}</strong></div>
            <div><span>Pendiente</span><strong>{formatoMoneda(pendiente)}</strong></div>
          </div>
          <button
            type="button"
            className="boton-primario boton-grande"
            disabled={guardando || !clienteId || !producto}
            onClick={() => void guardar()}
          >
            {guardando ? 'Registrando…' : 'CONFIRMAR VENTA'}
          </button>
        </div>
      ),
      validar: () => total > 0 ? null : 'El total de la venta debe ser mayor que 0.',
    },
  ], [clienteId, clientesFiltrados, productoId, productos, cantidad, metodo, montoParcial, total, pagado, pendiente, cliente, producto, rutaActiva, mostrarNuevoCliente, guardando]);

  async function guardar() {
    if (guardando || !clienteId || !producto) return;
    setGuardando(true);
    setError(null);
    if (!operacionIdRef.current) {
      operacionIdRef.current = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'venta-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    try {
      const id = await database.registrarVenta({
        cliente_id: Number(clienteId),
        ruta_id: rutaActiva?.id ?? null,
        producto_nombre: producto.nombre,
        cantidad,
        precio_aplicado: producto.precio,
        costo_aplicado: producto.costo,
        estado_pago: pagado === total ? 'PAGADA' : 'PENDIENTE',
        metodo_pago: metodo,
        monto_pagado: Math.max(0, pagado),
        operacion_id: operacionIdRef.current,
      });

      setVoucher({
        id,
        cliente: cliente?.nombre ?? '',
        producto: producto.nombre,
        cantidad,
        total,
        pagado: Math.max(0, pagado),
        pendiente,
        fecha: fechaLocalISO(),
        hora: horaLocalHHMM(),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function compartirWhatsApp() {
    if (!voucher) return;
    const texto = [
      'CAMELLO',
      'Comprobante de venta',
      'Venta #' + voucher.id,
      'Fecha: ' + voucher.fecha + ' ' + voucher.hora,
      'Cliente: ' + voucher.cliente,
      'Detalle: ' + voucher.producto + ' × ' + voucher.cantidad,
      'Total: ' + formatoMoneda(voucher.total),
      'Pagado: ' + formatoMoneda(voucher.pagado),
      'Pendiente: ' + formatoMoneda(voucher.pendiente),
    ].join('\n');
    const share = navigator.share;
    if (share) {
      await navigator.share({ title: 'Venta #' + voucher.id, text: texto });
      return;
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
  }

  if (voucher) {
    return (
      <div className="pantalla">
        <header className="encabezado"><h1>Venta registrada</h1></header>
        <section className="voucher tarjeta">
          <p className="texto-kicker">Comprobante</p>
          <h2>Venta #{voucher.id}</h2>
          <div className="lista-resumen">
            <div><span>Fecha</span><strong>{voucher.fecha} · {voucher.hora}</strong></div>
            <div><span>Cliente</span><strong>{voucher.cliente}</strong></div>
            <div><span>Detalle</span><strong>{voucher.producto} × {voucher.cantidad}</strong></div>
            <div><span>Total</span><strong>{formatoMoneda(voucher.total)}</strong></div>
            <div><span>Pagado</span><strong>{formatoMoneda(voucher.pagado)}</strong></div>
            <div><span>Pendiente</span><strong>{formatoMoneda(voucher.pendiente)}</strong></div>
          </div>
          <div className="fila-botones">
            <button className="boton-secundario" onClick={() => void compartirWhatsApp()}>Compartir por WhatsApp</button>
            <button className="boton-primario" onClick={() => navigate(rutaActiva ? '/rutas/' + rutaActiva.id : '/clientes/' + clienteId)}>Listo</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="pantalla">
      <header className="encabezado"><h1>Nueva venta</h1></header>
      {error && <p className="texto-error">{error}</p>}
      <AsistenteTarjetas
        titulo="Nueva venta"
        tarjetas={tarjetas}
        onCompletar={async () => {
          await guardar();
        }}
        onCancelar={() => navigate(-1)}
        textoFinal="CONFIRMAR VENTA"
      />
    </div>
  );
}
