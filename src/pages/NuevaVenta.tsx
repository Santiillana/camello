import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen, Producto, Ruta } from '../types';
import { fechaLocalISO, formatoMoneda, horaLocalHHMM } from '../utils/format';
import AsistenteTarjetas from '../components/AsistenteTarjetas';
import BorradorPendiente from '../components/BorradorPendiente';
import { useBorrador } from '../hooks/useBorrador';
import ClienteForm from '../components/ClienteForm';
import MetodoPagoSelector, { type MetodoPagoVenta } from '../components/MetodoPagoSelector';

type Metodo = MetodoPagoVenta;

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
  const clienteIdInicial = (() => {
    const estado: unknown = location.state;
    if (!estado || typeof estado !== 'object' || Array.isArray(estado)) return undefined;
    const candidato = Reflect.get(estado, 'clienteId');
    return typeof candidato === 'number' && Number.isInteger(candidato) ? candidato : undefined;
  })();
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteConResumen | null>(null);
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
  const [ventaAnulada, setVentaAnulada] = useState(false);
  const [pasoInicial, setPasoInicial] = useState(0);
  const operacionIdRef = useRef<string | null>(null);

  type DatosBorradorVenta = {
    clienteId: number | '';
    busquedaCliente: string;
    productoId: number | '';
    cantidad: number;
    metodo: Metodo;
    montoParcial: string;
  };
  const datosBorrador: DatosBorradorVenta = {
    clienteId, busquedaCliente, productoId, cantidad, metodo, montoParcial,
  };
  const borrador = useBorrador<DatosBorradorVenta>({
    tipo: 'venta-nueva',
    clave: 'nueva',
    datos: datosBorrador,
    paso: pasoInicial,
    activo: voucher === null,
  });

  useEffect(() => {
    let activo = true;
    Promise.all([
      database.listarClientes({ soloActivos: true, texto: '', limite: 50, offset: 0 }),
      database.listarProductos(),
      database.obtenerRutaActiva(),
      clienteIdInicial ? database.obtenerCliente(clienteIdInicial) : Promise.resolve(null),
    ]).then(([cs, ps, ruta, clienteInicial]) => {
      if (!activo) return;
      setClientes(cs);
      setProductos(ps);
      setRutaActiva(ruta);
      if (clienteInicial) {
        setClienteSeleccionado(clienteInicial);
        setClientes([clienteInicial, ...cs.filter((c) => c.id !== clienteInicial.id)]);
      }
      if (ps[0]) setProductoId(ps[0].id);
    }).catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { activo = false; };
  }, [clienteIdInicial]);

  useEffect(() => {
    let activo = true;
    const timer = window.setTimeout(() => {
      database.listarClientes({ soloActivos: true, texto: busquedaCliente, limite: 50, offset: 0 })
        .then((cs) => {
          if (!activo) return;
          setClientes((actuales) => {
            const seleccionado = clienteSeleccionado && !cs.some((c) => c.id === clienteSeleccionado.id) ? [clienteSeleccionado] : [];
            return [...seleccionado, ...cs];
          });
        })
        .catch((e: unknown) => { if (activo) setError(e instanceof Error ? e.message : String(e)); });
    }, 150);
    return () => { activo = false; window.clearTimeout(timer); };
  }, [busquedaCliente, clienteSeleccionado]);

  useEffect(() => {
    if (!clienteId || (clienteSeleccionado && clienteSeleccionado.id === clienteId)) return;
    let activo = true;
    database.obtenerCliente(Number(clienteId)).then((c) => {
      if (activo && c) setClienteSeleccionado(c);
    }).catch(() => undefined);
    return () => { activo = false; };
  }, [clienteId, clienteSeleccionado]);

  const producto = productos.find((p) => p.id === productoId);
  const cliente = clienteSeleccionado;
  const clientesFiltrados = clientes;

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
          borradorClave="venta-nuevo-cliente"
          onGuardado={async (id) => {
            const nuevo = await database.obtenerCliente(id);
            if (nuevo) {
              setClienteSeleccionado(nuevo);
              setClientes((actuales) => [nuevo, ...actuales.filter((c) => c.id !== id)]);
            }
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
            <input value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} placeholder="Nombre o mascota…" autoComplete="off" />
            <small className="detalle-cliente">La búsqueda se realiza en SQLite. Escribe nombre, teléfono o mascota.</small>
          </label>
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : '';
              setClienteId(id);
              setClienteSeleccionado(id ? clientes.find((c) => c.id === id) ?? null : null);
            }}>
              <option value="">Selecciona un cliente…</option>
              {clientesFiltrados.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
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
        <MetodoPagoSelector
          value={metodo}
          options={['EFECTIVO', 'TRANSFERENCIA_NEQUI', 'FIADO', 'PARCIAL']}
          onChange={setMetodo}
          extra={metodo === 'PARCIAL' ? (
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
          ) : undefined}
        />
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

      await borrador.limpiar();
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
      throw e;
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
    if (typeof navigator.share === 'function') {
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
            {!ventaAnulada && <button className="boton-secundario peligro-texto" onClick={async () => {
              const motivo = window.prompt('Motivo de anulación de la venta');
              if (!motivo) return;
              try {
                await database.anularVenta(voucher.id, motivo);
                setVentaAnulada(true);
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}>Anular venta</button>}
            {ventaAnulada && <span className="etiqueta-estado">Venta anulada</span>}
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
      {borrador.pendiente && (
        <BorradorPendiente
          fecha={borrador.pendiente.updated_at}
          onDescartar={() => void borrador.descartar()}
          onContinuar={async () => {
            const pendiente = borrador.pendiente;
            if (!pendiente) return;
            const paso = await borrador.continuar();
            const datos = pendiente.datos;
            setClienteId(datos.clienteId);
            setBusquedaCliente(datos.busquedaCliente);
            if (datos.clienteId) {
              const restaurado = await database.obtenerCliente(Number(datos.clienteId));
              if (restaurado) {
                setClienteSeleccionado(restaurado);
                setClientes((actuales) => [restaurado, ...actuales.filter((c) => c.id !== restaurado.id)]);
              }
            }
            setProductoId(datos.productoId);
            setCantidad(datos.cantidad);
            setMetodo(datos.metodo);
            setMontoParcial(datos.montoParcial);
            setPasoInicial(paso);
          }}
        />
      )}
      <AsistenteTarjetas
        titulo="Nueva venta"
        tarjetas={tarjetas}
        onCompletar={async () => {
          await guardar();
        }}
        onCancelar={() => navigate(-1)}
        textoFinal="CONFIRMAR VENTA"
        pasoInicial={pasoInicial}
        onPasoChange={setPasoInicial}
        onGuardarBorrador={borrador.guardarAhora}
        onDescartarBorrador={borrador.descartar}
      />
    </div>
  );
}
