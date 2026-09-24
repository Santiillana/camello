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
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    database.listarClientes({ soloActivos: true }).then(setClientes);
  }, []);

  const clientesConUbicacion = useMemo(() => clientes.filter((c) => c.lat != null && c.lng != null), [clientes]);

  const clientesFiltrados = useMemo(() => {
    if (filtro === 'todos') return clientesConUbicacion;
    if (filtro === 'pendientes') return clientesConUbicacion.filter((c) => c.pendiente > 0);
    return clientesConUbicacion.filter((c) => c.seguimiento === filtro);
  }, [clientesConUbicacion, filtro]);

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

  return (
    <div className="pantalla pantalla-mapa">
      <header className="encabezado">
        <h1>Mapa de clientes</h1>
      </header>

      <div className="filtros-mapa">
        {(['todos', 'ACTIVO', 'POR_CONTACTAR', 'INACTIVO', 'pendientes'] as Filtro[]).map((f) => (
          <button
            key={f}
            className={'chip-filtro' + (filtro === f ? ' activo' : '')}
            onClick={() => setFiltro(f)}
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
