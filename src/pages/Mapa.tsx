import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { database } from '../db/database';
import type { ClienteConResumen } from '../types';

// Arregla el ícono por defecto de Leaflet, que no se resuelve bien con el empaquetado de Vite.
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const VILLAVICENCIO: [number, number] = [4.142, -73.6266];

type Filtro = 'todos' | 'ACTIVO' | 'POR_CONTACTAR' | 'INACTIVO' | 'pendientes';

const COLOR_FILTRO: Record<string, string> = {
  ACTIVO: '#2f9e44',
  POR_CONTACTAR: '#f08c00',
  INACTIVO: '#868e96',
  pendientes: '#e03131',
};

export default function Mapa() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    database.listarClientes({ soloActivos: true }).then(setClientes);
  }, []);

  const clientesConUbicacion = useMemo(() => clientes.filter((c) => c.lat != null && c.lng != null), [clientes]);

  const clientesFiltrados = useMemo(() => {
    const texto = filtros.texto.trim().toLowerCase();
    const min = filtros.minDias === '' ? null : Number(filtros.minDias);
    const max = filtros.maxDias === '' ? null : Number(filtros.maxDias);
    return clientesConUbicacion.filter((c) => {
      if (texto) {
        const base = [c.nombre, c.telefono1 ?? '', c.telefono2 ?? '', ...c.mascotas.map((m) => m.nombre)].join(' ').toLowerCase();
        if (!base.includes(texto)) return false;
      }
      if (filtros.estado === 'pendientes' && c.pendiente <= 0) return false;
      if (filtros.estado !== 'todos' && filtros.estado !== 'pendientes' && c.seguimiento !== filtros.estado) return false;
      if (clientesRuta && !clientesRuta.has(c.id)) return false;
      const dias = c.dias_desde_ultima_compra;
      if (min != null && (dias == null || dias < min)) return false;
      if (max != null && (dias == null || dias > max)) return false;
      if (filtros.recompraVencida && (dias == null || dias < c.ritmo_dias)) return false;
      return true;
    });
  }, [clientesConUbicacion, filtros, clientesRuta]);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    mapaRef.current = L.map(contenedorRef.current).setView(VILLAVICENCIO, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; colaboradores de OpenStreetMap',
    }).addTo(mapaRef.current);
    capaMarcadoresRef.current = L.layerGroup().addTo(mapaRef.current);
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
      deuda.textContent = 'Deuda: ' + c.pendiente.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
      popup.appendChild(deuda);
      const acciones = document.createElement('div');
      acciones.style.display = 'flex';
      acciones.style.gap = '8px';
      const ficha = document.createElement('a');
      ficha.href = '#/clientes/' + c.id;
      ficha.textContent = 'Ver cliente';
      acciones.appendChild(ficha);
      if (c.lat != null && c.lng != null) {
        const llegar = document.createElement('a');
        llegar.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(c.lat + ',' + c.lng);
        llegar.target = '_blank';
        llegar.rel = 'noreferrer';
        llegar.textContent = 'Cómo llegar';
        acciones.appendChild(llegar);
      }
      popup.appendChild(acciones);
      marcador.bindPopup(popup);
      marcador.addTo(capaMarcadoresRef.current!);
    });
  }, [clientesFiltrados]);

  async function centrarEnMiUbicacion() {
    try {
      const ubicacion = await obtenerMejorUbicacion();
      setMiUbicacion({ lat: ubicacion.lat, lng: ubicacion.lng, precision: ubicacion.precision_m });
      mapaRef.current?.setView([ubicacion.lat, ubicacion.lng], 16);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

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
      {offline && <p className="banner-info">Sin internet: mapa base no disponible; los pines guardados siguen disponibles.</p>}

      <section className="tarjeta">
        <div className="grid-dos-columnas">
          <label>
            Buscar cliente o mascota
            <input value={filtros.texto} onChange={(e) => setFiltros((v) => ({ ...v, texto: e.target.value }))} />
          </label>
          <label>
            Visitados en ruta
            <select value={filtros.rutaId} onChange={(e) => setFiltros((v) => ({ ...v, rutaId: e.target.value }))}>
              <option value="">Todas las rutas</option>
              {rutas.filter((r) => r.estado !== 'CANCELADA').map((r) => (
                <option key={r.id} value={r.id}>{r.nombre || r.tipo} · {r.fecha}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid-dos-columnas">
          <label>Desde días sin comprar<input type="number" min={0} value={filtros.minDias} onChange={(e) => setFiltros((v) => ({ ...v, minDias: e.target.value }))} /></label>
          <label>Hasta días sin comprar<input type="number" min={0} value={filtros.maxDias} onChange={(e) => setFiltros((v) => ({ ...v, maxDias: e.target.value }))} /></label>
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

      <p className="detalle-cliente">{clientesFiltrados.length} de {clientesConUbicacion.length} clientes con ubicación cumplen los filtros.</p>

      <div className="filtros-mapa">
        {(['todos', 'ACTIVO', 'POR_CONTACTAR', 'INACTIVO', 'pendientes'] as Filtro[]).map((f) => (
          <button
            key={f}
            className={'chip-filtro' + (filtros.estado === f ? ' activo' : '')}
            onClick={() => setFiltros((v) => ({ ...v, estado: f }))}
          >
            {f === 'todos' ? 'Todos' : f === 'ACTIVO' ? 'Activos' : f === 'POR_CONTACTAR' ? 'Por contactar' : f === 'INACTIVO' ? 'Inactivos' : 'Con pagos pendientes'}
          </button>
        ))}
      </div>

      <div ref={contenedorRef} className="contenedor-mapa" />

      <p className="texto-vacio">
        {clientesConUbicacion.length} de {clientes.length} clientes tienen ubicación guardada.
      </p>
    </div>
  );
}
