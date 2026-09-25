import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { database } from '../db/database';
import type { PedidoConDetalle, RutaConResumen, TipoRuta } from '../types';
import { formatoFecha, formatoMoneda } from '../utils/format';
import AsistenteTarjetas from '../components/AsistenteTarjetas';
import BorradorPendiente from '../components/BorradorPendiente';
import { useBorrador } from '../hooks/useBorrador';

const TIPOS: TipoRuta[] = ['Puerta a puerta', 'Venta local móvil', 'Entrega de pedidos'];
const ETIQUETA_ESTADO: Record<string, string> = {
  EN_CURSO: 'En curso',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

function esTipoRuta(valor: string): TipoRuta {
  return valor === 'Puerta a puerta' || valor === 'Venta local móvil' || valor === 'Entrega de pedidos' ? valor : 'Puerta a puerta';
}

export default function Rutas() {
  const [rutas, setRutas] = useState<RutaConResumen[]>([]);
  const [params] = useSearchParams();
  const [mostrarForm, setMostrarForm] = useState(params.get('nuevo') === '1');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      setRutas(await database.listarRutas());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const rutaActiva = rutas.find((r) => r.estado === 'EN_CURSO') ?? null;

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Recorridos comerciales</p>
          <h1>Rutas</h1>
        </div>
        {!rutaActiva && (
          <button
            className="boton-primario"
            onClick={() => {
              const siguiente = !mostrarForm;
              setMostrarForm(siguiente);
              navigate(siguiente ? '/rutas?nuevo=1' : '/rutas');
            }}
          >
            {mostrarForm ? 'Cancelar' : '+ Nueva ruta'}
          </button>
        )}
      </header>

      {rutaActiva && (
        <Link to={'/rutas/' + rutaActiva.id} className="banner-ruta-activa">
          🧭 Ruta en curso · {rutaActiva.nombre || rutaActiva.tipo}
        </Link>
      )}

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && !rutaActiva && (
        <FormNuevaRuta
          onCreada={async (id) => {
            setMostrarForm(false);
            await cargar();
            window.location.hash = '#/rutas/' + id;
          }}
          onCancelar={() => {
            setMostrarForm(false);
            navigate('/rutas');
          }}
        />
      )}

      <ul className="lista-rutas">
        {rutas.map((ruta) => (
          <li key={ruta.id} className="tarjeta">
            <Link to={'/rutas/' + ruta.id} className="tarjeta-ruta">
              <div>
                <strong>{ruta.nombre || ruta.tipo}</strong>
                <div className="detalle-cliente">
                  {ruta.tipo} · {formatoFecha(ruta.fecha)} · {ETIQUETA_ESTADO[ruta.estado] ?? ruta.estado}
                </div>
                <div className="detalle-cliente">
                  {ruta.vendidos} vendidos · {ruta.clientes_atendidos} clientes · {formatoMoneda(ruta.total_vendido)}
                </div>
              </div>
              <div className="lado-derecho-cliente">
                <strong>{ruta.estado === 'EN_CURSO' ? 'Abierta' : formatoMoneda(ruta.total_vendido)}</strong>
                {ruta.estado === 'FINALIZADA' && (
                  <span className="detalle-cliente">{ruta.paquetes_sobrantes ?? ruta.sobrantes} sobrantes</span>
                )}
              </div>
            </Link>
            {ruta.estado === 'EN_CURSO' && (
              <Link className="boton-primario boton-grande" to={'/rutas/' + ruta.id}>
                Continuar ruta
              </Link>
            )}
          </li>
        ))}
        {rutas.length === 0 && <p className="texto-vacio">Todavía no has registrado rutas.</p>}
      </ul>
    </div>
  );
}

function FormNuevaRuta({
  onCreada,
  onCancelar,
}: {
  onCreada: (id: number) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('Ruta de hoy');
  const [tipo, setTipo] = useState<TipoRuta>('Puerta a puerta');
  const [paquetes, setPaquetes] = useState(20);
  const [usarGps, setUsarGps] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasoInicial, setPasoInicial] = useState(0);
  const [pedidosDisponibles, setPedidosDisponibles] = useState<PedidoConDetalle[]>([]);
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<number[]>([]);
  const datosBorrador = { nombre, tipo, paquetes, usarGps };
  useEffect(() => {
    if (tipo !== 'Entrega de pedidos') {
      setPedidosDisponibles([]);
      setPedidosSeleccionados([]);
      return;
    }
    void database.listarPedidos({ estados: ['PENDIENTE'], sinRuta: true })
      .then(setPedidosDisponibles)
      .catch(() => setPedidosDisponibles([]));
  }, [tipo]);

  const borrador = useBorrador<typeof datosBorrador>({
    tipo: 'ruta-nueva',
    clave: 'nueva',
    datos: datosBorrador,
    paso: pasoInicial,
  });

  const tarjetas = [
    {
      id: 'nombre',
      titulo: 'Nombre de la ruta',
      contenido: <label>Nombre de la ruta<input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>,
      validar: () => nombre.trim() ? null : 'Escribe un nombre para la ruta.',
    },
    {
      id: 'tipo',
      titulo: 'Tipo de recorrido',
      contenido: <label>Tipo de recorrido<select value={tipo} onChange={(e) => setTipo(esTipoRuta(e.target.value))}>
        {TIPOS.map((item) => <option key={item}>{item}</option>)}
      </select></label>,
    },
    {
      id: 'paquetes',
      titulo: 'Paquetes llevados',
      contenido: tipo === 'Entrega de pedidos'
        ? <div className="tarjeta-interna"><strong>{pedidosSeleccionados.reduce((total, id) => total + (pedidosDisponibles.find((pedido) => pedido.id === id)?.items.reduce((s, item) => s + item.cantidad, 0) ?? 0), 0)}</strong><span className="detalle-cliente">paquetes comprometidos</span></div>
        : <label>Paquetes llevados<input type="number" min={1} step={1} value={paquetes} onChange={(e) => setPaquetes(Number(e.target.value))} inputMode="numeric" /></label>,
      validar: () => tipo === 'Entrega de pedidos'
        ? (pedidosSeleccionados.length > 0 ? null : 'Selecciona al menos un pedido para una ruta de entrega.')
        : (Number.isInteger(paquetes) && paquetes > 0 ? null : 'La cantidad debe ser mayor que 0.'),
    },
    {
      id: 'pedidos',
      titulo: 'Pedidos a entregar',
      contenido: tipo === 'Entrega de pedidos' ? (
        <div className="selector-clientes-mapa">
          <p className="detalle-cliente">Selecciona los pedidos que vas a entregar hoy. El orden será el de esta selección.</p>
          <div className="lista-seleccion-clientes" role="group" aria-label="Pedidos disponibles">
            {pedidosDisponibles.map((pedido) => (
              <label key={pedido.id}>
                <input type="checkbox" checked={pedidosSeleccionados.includes(pedido.id)} onChange={(e) => setPedidosSeleccionados((actual) => e.target.checked ? [...actual, pedido.id] : actual.filter((id) => id !== pedido.id))} />
                <span>{pedido.cliente_nombre} · {formatoMoneda(pedido.total_estimado)} · {pedido.items.map((item) => item.producto_nombre + ' × ' + item.cantidad).join(', ')}</span>
              </label>
            ))}
            {!pedidosDisponibles.length && <p className="texto-vacio">No hay pedidos pendientes sin ruta. Primero créalos en Pedidos.</p>}
          </div>
        </div>
      ) : <p className="texto-vacio">Este paso se usa solo en una ruta de entrega.</p>,
      validar: () => tipo === 'Entrega de pedidos' && pedidosSeleccionados.length === 0 ? 'Selecciona al menos un pedido para una ruta de entrega.' : null,
    },
    {
      id: 'gps',
      titulo: 'Ubicación de inicio',
      opcional: true,
      contenido: (
        <label className="fila-checkbox">
          <input type="checkbox" checked={usarGps} onChange={(e) => setUsarGps(e.target.checked)} />
          Registrar ubicación de inicio con GPS
        </label>
      ),
    },
    {
      id: 'confirmar',
      titulo: 'Confirmar ruta',
      contenido: <div className="resumen-venta"><div className="lista-resumen">
        <div><span>Nombre</span><strong>{nombre}</strong></div>
        <div><span>Tipo</span><strong>{tipo}</strong></div>
        <div><span>Paquetes</span><strong>{tipo === 'Entrega de pedidos' ? pedidosSeleccionados.reduce((total, id) => total + (pedidosDisponibles.find((pedido) => pedido.id === id)?.items.reduce((s, item) => s + item.cantidad, 0) ?? 0), 0) : paquetes}</strong></div>
        <div><span>Pedidos</span><strong>{tipo === 'Entrega de pedidos' ? pedidosSeleccionados.length : '—'}</strong></div>
        <div><span>GPS</span><strong>{usarGps ? 'Sí' : 'No'}</strong></div>
      </div></div>,
    },
  ];

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (usarGps && navigator.geolocation) {
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
          // La ubicación de inicio es opcional.
        }
      }
      const id = await database.iniciarRuta({
        nombre: nombre.trim(),
        tipo,
        paquetes_llevados: tipo === 'Entrega de pedidos'
          ? pedidosSeleccionados.reduce((total, id) => total + (pedidosDisponibles.find((pedido) => pedido.id === id)?.items.reduce((s, item) => s + item.cantidad, 0) ?? 0), 0)
          : paquetes,
        lat_inicio: lat,
        lng_inicio: lng,
      });
      if (tipo === 'Entrega de pedidos') await database.asignarPedidosARuta(id, pedidosSeleccionados);
      await borrador.limpiar();
      await onCreada(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {borrador.pendiente && (
        <BorradorPendiente
          fecha={borrador.pendiente.updated_at}
          onDescartar={() => void borrador.descartar()}
          onContinuar={async () => {
            const pendiente = borrador.pendiente;
            if (!pendiente) return;
            const paso = await borrador.continuar();
            setNombre(pendiente.datos.nombre);
            setTipo(pendiente.datos.tipo);
            setPaquetes(pendiente.datos.paquetes);
            setUsarGps(pendiente.datos.usarGps);
            setPasoInicial(paso);
          }}
        />
      )}
      {error && <p className="texto-error">{error}</p>}
      <AsistenteTarjetas
        titulo="Nueva ruta"
        tarjetas={tarjetas}
        onCompletar={guardar}
        onCancelar={onCancelar}
        textoFinal={guardando ? 'Iniciando…' : 'Iniciar ruta'}
        pasoInicial={pasoInicial}
        onPasoChange={setPasoInicial}
        onGuardarBorrador={borrador.guardarAhora}
        onDescartarBorrador={borrador.descartar}
      />
    </>
  );
}
