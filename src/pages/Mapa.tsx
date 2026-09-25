import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { database } from '../db/database';
import type { ClienteConResumen, PedidoConDetalle, RutaConResumen } from '../types';
import { obtenerMejorUbicacion } from '../utils/ubicacion';


const VILLAVICENCIO: [number, number] = [4.142, -73.6266];
const CLAVE_FILTROS_MAPA = 'camello.mapa.filtros.v1';

type Filtro = 'todos' | 'ACTIVO' | 'POR_CONTACTAR' | 'INACTIVO' | 'pendientes';
function esFiltroMapa(value: string): value is Filtro { return value === 'todos' || value === 'ACTIVO' || value === 'POR_CONTACTAR' || value === 'INACTIVO' || value === 'pendientes'; }

type FiltrosMapa = {
  texto: string;
  estado: Filtro;
  rutaId: string;
  minDias: string;
  maxDias: string;
  recompraVencida: boolean;
};

const FILTROS_DEFAULT: FiltrosMapa = {
  texto: '',
  estado: 'todos',
  rutaId: '',
  minDias: '',
  maxDias: '',
  recompraVencida: false,
};

const COLOR_FILTRO: Record<string, string> = {
  ACTIVO: '#2f9e44',
  POR_CONTACTAR: '#f08c00',
  INACTIVO: '#868e96',
  pendientes: '#e03131',
};

function cargarFiltrosGuardados(): FiltrosMapa {
  try {
    const raw = localStorage.getItem(CLAVE_FILTROS_MAPA);
    if (!raw) return FILTROS_DEFAULT;
    const parsedUnknown: unknown = JSON.parse(raw);
    if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) return FILTROS_DEFAULT;
    const parsed: { estado?: unknown; texto?: unknown; rutaId?: unknown; minDias?: unknown; maxDias?: unknown; recompraVencida?: unknown } = {
      estado: 'estado' in parsedUnknown ? parsedUnknown.estado : undefined,
      texto: 'texto' in parsedUnknown ? parsedUnknown.texto : undefined,
      rutaId: 'rutaId' in parsedUnknown ? parsedUnknown.rutaId : undefined,
      minDias: 'minDias' in parsedUnknown ? parsedUnknown.minDias : undefined,
      maxDias: 'maxDias' in parsedUnknown ? parsedUnknown.maxDias : undefined,
      recompraVencida: 'recompraVencida' in parsedUnknown ? parsedUnknown.recompraVencida : undefined,
    };
    const estado = parsed.estado;
    const filtroEstado: Filtro = estado === 'ACTIVO' || estado === 'POR_CONTACTAR' || estado === 'INACTIVO' || estado === 'pendientes'
      ? estado
      : 'todos';
    return {
      texto: typeof parsed.texto === 'string' ? parsed.texto : '',
      estado: filtroEstado,
      rutaId: typeof parsed.rutaId === 'string' ? parsed.rutaId : '',
      minDias: typeof parsed.minDias === 'string' ? parsed.minDias : '',
      maxDias: typeof parsed.maxDias === 'string' ? parsed.maxDias : '',
      recompraVencida: parsed.recompraVencida === true,
    };
  } catch {
    return FILTROS_DEFAULT;
  }
}

export default function Mapa() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [rutas, setRutas] = useState<RutaConResumen[]>([]);
  const [filtros, setFiltros] = useState<FiltrosMapa>(cargarFiltrosGuardados);
  const [clientesRuta, setClientesRuta] = useState<Set<number> | null>(null);
  const [clientesSeleccionados, setClientesSeleccionados] = useState<Set<number>>(new Set());
  const [mostrarSeleccionClientes, setMostrarSeleccionClientes] = useState(false);
  const [pedidosRuta, setPedidosRuta] = useState<PedidoConDetalle[]>([]);
  const [miUbicacion, setMiUbicacion] = useState<{ lat: number; lng: number; precision?: number } | null>(null);
  const [callesCargando, setCallesCargando] = useState(true);
  const [callesError, setCallesError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);
  const capaRutaRef = useRef<L.LayerGroup | null>(null);
  const capaCallesRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    let activo = true;
    Promise.all([
      database.listarClientes({ soloActivos: true, limite: 2000 }),
      database.listarRutas(),
    ]).then(([clientesResultado, rutasResultado]) => {
      if (!activo) return;
      setClientes(clientesResultado);
      setRutas(rutasResultado);
      setError(null);
    }).catch((e: unknown) => {
      if (activo) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_FILTROS_MAPA, JSON.stringify(filtros));
    } catch {
      // La persistencia de filtros es opcional y nunca bloquea el mapa.
    }
  }, [filtros]);

  useEffect(() => {
    let activo = true;
    if (!filtros.rutaId) {
      setClientesRuta(null);
      setPedidosRuta([]);
      return () => { activo = false; };
    }

    const rutaId = Number(filtros.rutaId);
    if (!Number.isInteger(rutaId) || rutaId <= 0) {
      setClientesRuta(null);
      setPedidosRuta([]);
      return () => { activo = false; };
    }

    Promise.all([
      database.listarVentasPorRuta(rutaId),
      database.listarPedidos({ rutaId }).catch(() => [] as PedidoConDetalle[]),
    ])
      .then(([ventas, pedidos]) => {
        if (!activo) return;
        setClientesRuta(new Set(ventas.map((venta) => venta.cliente_id)));
        setPedidosRuta(pedidos);
      })
      .catch((e: unknown) => {
        if (!activo) return;
        setClientesRuta(null);
        setPedidosRuta([]);
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      activo = false;
    };
  }, [filtros.rutaId]);

  const clientesConUbicacion = useMemo(
    () => clientes.filter((c) => c.lat != null && c.lng != null),
    [clientes],
  );

  const clientesFiltrados = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase();
    const min = filtros.minDias === '' ? null : Number(filtros.minDias);
    const max = filtros.maxDias === '' ? null : Number(filtros.maxDias);

    return clientesConUbicacion.filter((c) => {
      if (texto) {
        const base = [
          c.nombre,
          c.telefono1 ?? '',
          c.telefono2 ?? '',
          ...c.mascotas.map((m) => m.nombre),
        ].join(' ').toLowerCase();
        if (!base.includes(texto)) return false;
      }

      if (filtros.estado === 'pendientes' && c.pendiente <= 0) return false;
      if (filtros.estado !== 'todos' && filtros.estado !== 'pendientes' && c.seguimiento !== filtros.estado) return false;
      if (clientesRuta && !clientesRuta.has(c.id)) return false;
      if (clientesSeleccionados.size > 0 && !clientesSeleccionados.has(c.id)) return false;

      const dias = c.dias_desde_ultima_compra;
      if (min != null && Number.isFinite(min) && (dias == null || dias < min)) return false;
      if (max != null && Number.isFinite(max) && (dias == null || dias > max)) return false;
      if (filtros.recompraVencida && (dias == null || dias < c.ritmo_dias)) return false;

      return true;
    });
  }, [clientesConUbicacion, filtros, clientesRuta, clientesSeleccionados]);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current, { zoomControl: true }).setView(VILLAVICENCIO, 13);
    mapaRef.current = mapa;

    const calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      detectRetina: true,
      keepBuffer: 4,
      updateWhenIdle: true,
      attribution: '© OpenStreetMap contributors',
    });
    calles.on('load', () => {
      setCallesCargando(false);
      setCallesError(false);
    });
    calles.on('tileerror', () => {
      setCallesCargando(false);
      setCallesError(true);
    });
    calles.addTo(mapa);
    capaCallesRef.current = calles;

    capaMarcadoresRef.current = L.layerGroup().addTo(mapa);
    capaRutaRef.current = L.layerGroup().addTo(mapa);
    const redimensionar = () => {
      if (!mapaRef.current || !contenedorRef.current) return;
      mapa.invalidateSize({ pan: false });
    };
    const timerInicial = window.setTimeout(redimensionar, 0);
    const timerEstable = window.setTimeout(redimensionar, 250);
    const observador = typeof ResizeObserver !== 'undefined' && contenedorRef.current
      ? new ResizeObserver(redimensionar)
      : null;
    if (observador && contenedorRef.current) observador.observe(contenedorRef.current);
    window.addEventListener('resize', redimensionar);

    return () => {
      window.clearTimeout(timerInicial);
      window.clearTimeout(timerEstable);
      observador?.disconnect();
      window.removeEventListener('resize', redimensionar);
      mapa.stop();
      capaMarcadoresRef.current?.clearLayers();
      capaMarcadoresRef.current = null;
      capaRutaRef.current?.clearLayers();
      capaRutaRef.current = null;
      capaCallesRef.current?.off();
      capaCallesRef.current = null;
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!capaMarcadoresRef.current) return;
    capaMarcadoresRef.current.clearLayers();

    clientesFiltrados.forEach((c) => {
      const color = COLOR_FILTRO[c.pendiente > 0 ? 'pendientes' : c.seguimiento] ?? '#1971c2';
      const marcador = L.circleMarker([c.lat!, c.lng!], {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      });

      const popup = document.createElement('div');

      const nombre = document.createElement('strong');
      nombre.textContent = c.nombre;
      popup.appendChild(nombre);

      const telefono = document.createElement('div');
      telefono.textContent = c.telefono1 ?? '';
      popup.appendChild(telefono);

      const compra = document.createElement('div');
      compra.textContent = c.ultima_compra ? 'Última compra: ' + c.ultima_compra : 'Sin compras';
      popup.appendChild(compra);

      const deuda = document.createElement('div');
      deuda.textContent = 'Deuda: ' + c.pendiente.toLocaleString('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      });
      popup.appendChild(deuda);

      const acciones = document.createElement('div');
      acciones.style.display = 'flex';
      acciones.style.gap = '8px';

      const ficha = document.createElement('a');
      ficha.href = '#/clientes/' + c.id;
      ficha.textContent = 'Ver cliente';
      acciones.appendChild(ficha);

      const llegar = document.createElement('a');
      llegar.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.lat + ',' + c.lng);
      llegar.target = '_blank';
      llegar.rel = 'noreferrer';
      llegar.textContent = 'Cómo llegar';
      acciones.appendChild(llegar);

      popup.appendChild(acciones);

      marcador.on('popupopen', () => {
        void database.listarFotosCliente(c.id).then((fotos) => {
          if (!fotos.length || popup.querySelector('img')) return;
          const img = document.createElement('img');
          img.src = fotos[0].data_url;
          img.alt = 'Foto de ' + c.nombre;
          img.style.width = '96px';
          img.style.height = '96px';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '8px';
          popup.prepend(img);
        }).catch(() => {
          // La foto es opcional; no debe impedir abrir el popup.
        });
      });

      marcador.bindPopup(popup);
      marcador.addTo(capaMarcadoresRef.current!);
    });
  }, [clientesFiltrados]);

  useEffect(() => {
    if (!capaRutaRef.current || !filtros.rutaId) {
      capaRutaRef.current?.clearLayers();
      return;
    }
    capaRutaRef.current.clearLayers();
    const paradas = pedidosRuta
      .filter((pedido) => pedido.estado !== 'CANCELADO')
      .sort((a,b) => Number(a.orden_entrega ?? 0) - Number(b.orden_entrega ?? 0))
      .map((pedido) => {
        const cliente = clientes.find((item) => item.id === pedido.cliente_id);
        return cliente?.lat != null && cliente?.lng != null ? { pedido, lat: cliente.lat, lng: cliente.lng } : null;
      })
      .filter((item): item is { pedido: PedidoConDetalle; lat:number; lng:number } => item !== null);

    if (paradas.length < 2) return;
    const capaRuta = capaRutaRef.current;
    if (!capaRuta || paradas.length < 2) return;
    const latlngs = paradas.map((item) => [item.lat, item.lng] as [number,number]);
    L.polyline(latlngs, { weight: 4, opacity: 0.75, dashArray: '8 6' }).addTo(capaRuta);
    paradas.forEach((item, index) => {
      L.circleMarker([item.lat,item.lng], {
        radius: 13,
        color: '#212529',
        fillColor: '#fff',
        fillOpacity: 0.9,
        weight: 2,
      }).bindTooltip(String(index + 1), { permanent: true, direction: 'center', className: 'mapa-numero-parada' }).addTo(capaRuta);
    });
  }, [pedidosRuta, clientes, filtros.rutaId]);

  async function centrarEnMiUbicacion() {
    setError(null);
    try {
      const ubicacion = await obtenerMejorUbicacion();
      setMiUbicacion({
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        precision: ubicacion.precision_m,
      });
      mapaRef.current?.setView([ubicacion.lat, ubicacion.lng], 16);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const sinUbicacion = clientes.filter((c) => c.lat == null || c.lng == null);

  return (
    <div className="pantalla pantalla-mapa">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Clientes geolocalizados</p>
          <h1>Mapa de clientes</h1>
        </div>
        <button className="boton-secundario" onClick={() => void centrarEnMiUbicacion()}>Centrar en mí</button>
      </header>

      {error && <p className="texto-error">{error}</p>}
      <p className="banner-info">
        {callesCargando ? 'Cargando calles del mapa…' : callesError ? 'No se pudieron cargar las calles. Los clientes y sus coordenadas siguen disponibles.' : 'Mapa con calles de OpenStreetMap.'}
        {' '}Los datos y filtros de clientes siguen almacenados localmente. La línea de una ruta representa el orden de las paradas y no sustituye la navegación giro a giro.
      </p>
      {callesError && <button type="button" className="boton-secundario" onClick={() => {
        setCallesError(false);
        setCallesCargando(true);
        capaCallesRef.current?.redraw();
        mapaRef.current?.invalidateSize({ pan: false });
      }}>Reintentar calles</button>}
      {miUbicacion && <p className="detalle-cliente">Mi ubicación: ±{miUbicacion.precision != null ? Math.round(miUbicacion.precision) + ' m' : 'precisión no disponible'}.</p>}

      <section className="tarjeta">
        <div className="grid-dos-columnas">
          <label>
            Buscar cliente o mascota
            <input value={filtros.texto} onChange={(e) => setFiltros((v) => ({ ...v, texto: e.target.value }))} placeholder="Nombre o mascota…" />
          </label>
          <label>
            Ruta
            <select value={filtros.rutaId} onChange={(e) => setFiltros((v) => ({ ...v, rutaId: e.target.value }))}>
              <option value="">Todas las rutas</option>
              {rutas.filter((r) => r.estado !== 'CANCELADA').map((r) => (
                <option key={r.id} value={r.id}>{r.nombre || r.tipo} · {r.fecha}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="selector-clientes-mapa">
          <div className="fila-titulo-boton">
            <strong>Clientes específicos</strong>
            <span className="detalle-cliente">{clientesSeleccionados.size} seleccionados</span>
          </div>
          <div className="fila-botones">
            <button type="button" className="boton-secundario" onClick={() => setMostrarSeleccionClientes((v) => !v)}>
              {mostrarSeleccionClientes ? 'Ocultar selección' : 'Seleccionar clientes'}
            </button>
            {clientesSeleccionados.size > 0 && <button type="button" className="boton-texto" onClick={() => setClientesSeleccionados(new Set())}>Limpiar selección</button>}
          </div>
          {mostrarSeleccionClientes && (
            <div className="lista-seleccion-clientes" role="group" aria-label="Clientes específicos del mapa">
              {clientes.filter((c) => c.lat != null && c.lng != null).map((cliente) => (
                <label key={cliente.id}>
                  <input
                    type="checkbox"
                    checked={clientesSeleccionados.has(cliente.id)}
                    onChange={(e) => setClientesSeleccionados((actual) => {
                      const siguiente = new Set(actual);
                      if (e.target.checked) siguiente.add(cliente.id); else siguiente.delete(cliente.id);
                      return siguiente;
                    })}
                  />
                  <span>{cliente.nombre}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="grid-dos-columnas">
          <label>
            Desde días sin comprar
            <input type="number" min={0} value={filtros.minDias} onChange={(e) => setFiltros((v) => ({ ...v, minDias: e.target.value }))} />
          </label>
          <label>
            Hasta días sin comprar
            <input type="number" min={0} value={filtros.maxDias} onChange={(e) => setFiltros((v) => ({ ...v, maxDias: e.target.value }))} />
          </label>
        </div>
        <label className="fila-checkbox">
          <input type="checkbox" checked={filtros.recompraVencida} onChange={(e) => setFiltros((v) => ({ ...v, recompraVencida: e.target.checked }))} />
          Recompra vencida según ritmo
        </label>
        <div className="fila-botones">
          <button className="boton-secundario" onClick={() => setFiltros(FILTROS_DEFAULT)}>Limpiar filtros</button>
          <button className="boton-primario" onClick={() => void centrarEnMiUbicacion()}>Centrar en mi ubicación</button>
        </div>
      </section>

      <p className="detalle-cliente">{clientesFiltrados.length} de {clientesConUbicacion.length} clientes con ubicación cumplen los filtros.{pedidosRuta.length > 0 ? ' · ' + pedidosRuta.length + ' pedidos en la ruta seleccionada.' : ''}</p>

      <div className="filtros-mapa">
        {['todos', 'ACTIVO', 'POR_CONTACTAR', 'INACTIVO', 'pendientes'].filter(esFiltroMapa).map((f) => (
          <button
            key={f}
            className={'chip-filtro' + (filtros.estado === f ? ' activo' : '')}
            onClick={() => setFiltros((v) => ({ ...v, estado: f }))}
          >
            {f === 'todos'
              ? 'Todos'
              : f === 'ACTIVO'
                ? 'Activos'
                : f === 'POR_CONTACTAR'
                  ? 'Por contactar'
                  : f === 'INACTIVO'
                    ? 'Inactivos'
                    : 'Con pagos pendientes'}
          </button>
        ))}
      </div>

      <div ref={contenedorRef} className="contenedor-mapa mapa-vectorial-local" />

      <div className="leyenda-mapa">
        <span>● Activo</span>
        <span>● Por contactar</span>
        <span>● Inactivo</span>
        <span>● Deuda</span>
      </div>

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Pendientes de ubicación</p>
            <h2>{sinUbicacion.length} clientes sin ubicación</h2>
          </div>
        </div>
        {sinUbicacion.length === 0 ? (
          <p className="texto-vacio">Todos los clientes activos tienen ubicación.</p>
        ) : (
          <ul className="lista-resumen">
            {sinUbicacion.slice(0, 8).map((cliente) => (
              <li key={cliente.id} className="fila-recordatorio">
                <a href={'#/clientes/' + cliente.id}>{cliente.nombre}</a>
                <a className="boton-chip" href={'#/clientes/' + cliente.id}>Agregar ubicación</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
