import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

type Props = { lat: number; lng: number };

export default function UbicacionMiniMapa({ lat, lng }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const mapa = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView([lat, lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; colaboradores de OpenStreetMap',
    }).addTo(mapa);
    L.marker([lat, lng]).addTo(mapa);
    return () => mapa.remove();
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
