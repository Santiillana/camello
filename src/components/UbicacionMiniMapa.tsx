import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ICONO_PIN = '<svg viewBox="0 0 40 50" width="40" height="50" aria-hidden="true"><path d="M20 48C20 48 4 29 4 18A16 16 0 1 1 36 18C36 29 20 48 20 48Z" fill="#c2642b" stroke="#111" stroke-width="2"/><circle cx="20" cy="18" r="6" fill="#fff"/></svg>';

type Props = { lat: number; lng: number };

export default function UbicacionMiniMapa({ lat, lng }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const mapa = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; colaboradores de OpenStreetMap' }).addTo(mapa);
    const icono = L.divIcon({ className: 'camello-pin', html: ICONO_PIN, iconSize: [40, 50], iconAnchor: [20, 48] });
    L.marker([lat, lng], { icon: icono, keyboard: true, title: 'Ubicación del cliente' }).addTo(mapa);
    return () => { mapa.remove(); };
  }, [lat, lng]);

  const url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lng);

  return (
    <div className="ubicacion-ficha">
      <div ref={ref} className="contenedor-mapa mini-mapa" />
      <div className="ubicacion-ficha-datos">
        <span>{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        <a className="boton-secundario" href={url} target="_blank" rel="noreferrer">Cómo llegar</a>
      </div>
    </div>
  );
}
