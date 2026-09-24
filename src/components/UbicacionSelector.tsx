import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  coordenadasIniciales,
  coordenadasValidas,
  obtenerMejorUbicacion,
  resolverUbicacionPegada,
  type Coordenadas,
} from '../utils/ubicacion';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

type Props = {
  lat?: number;
  lng?: number;
  precision_m?: number | null;
  fuente?: Coordenadas['fuente'] | null;
  onChange: (value: { lat: number; lng: number; precision_m?: number; fuente: Coordenadas['fuente'] }) => void;
  onOmitir?: () => void;
};

export default function UbicacionSelector({ lat, lng, precision_m, fuente, onChange, onOmitir }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.Marker | null>(null);
  const [pegado, setPegado] = useState('');
  const [obteniendo, setObteniendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actual = lat != null && lng != null
    ? { lat, lng }
    : coordenadasIniciales();

  useEffect(() => {
    try {
      const compartido = localStorage.getItem('camello.sharedText');
      if (compartido && !pegado) {
        setPegado(compartido);
        setMensaje('Ubicación compartida desde Android lista para pegar.');
      }
    } catch {}

    const recibirCompartido = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const texto = detail?.text?.trim();
      if (!texto) return;
      try { localStorage.setItem('camello.sharedText', texto); } catch {}
      setPegado(texto);
      setMensaje('Ubicación compartida desde Android lista para pegar.');
      setError(null);
    };

    window.addEventListener('camelloShare', recibirCompartido);
    return () => window.removeEventListener('camelloShare', recibirCompartido);
  }, []);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([actual.lat, actual.lng], lat != null ? 16 : 13);
    mapaRef.current = mapa;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; colaboradores de OpenStreetMap',
    }).addTo(mapa);
    marcadorRef.current = L.marker([actual.lat, actual.lng], { draggable: true }).addTo(mapa);
    marcadorRef.current.on('dragend', () => {
      const posicion = marcadorRef.current?.getLatLng();
      if (!posicion || !coordenadasValidas(posicion.lat, posicion.lng)) return;
      onChange({ lat: posicion.lat, lng: posicion.lng, fuente: 'manual' });
      setMensaje('Ubicación ajustada manualmente.');
      setError(null);
    });
    return () => {
      mapa.remove();
      mapaRef.current = null;
      marcadorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapaRef.current || !marcadorRef.current) return;
    marcadorRef.current.setLatLng([actual.lat, actual.lng]);
    mapaRef.current.setView([actual.lat, actual.lng], lat != null ? 16 : 13);
  }, [lat, lng]);

  async function gps() {
    setObteniendo(true);
    setError(null);
    setMensaje(null);
    try {
      const resultado = await obtenerMejorUbicacion();
      onChange(resultado);
      setMensaje(
        resultado.precision_m != null
          ? resultado.precision_m > 50
            ? `GPS obtenido con ±${Math.round(resultado.precision_m)} m. Es poco preciso; mueve el pin o reintenta.`
            : `GPS obtenido con ±${Math.round(resultado.precision_m)} m.`
          : 'GPS obtenido.',
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setObteniendo(false);
    }
  }

  async function pegar() {
    setError(null);
    setMensaje(null);
    const resultado = await resolverUbicacionPegada(pegado);
    if (!resultado) {
      setError('No pude extraer coordenadas. Con un enlace corto de Google Maps necesitas internet; también puedes introducir latitud y longitud manualmente.');
      return;
    }
    onChange(resultado);
    setMensaje('Ubicación pegada de Google Maps.');
    setPegado('');
    try { localStorage.removeItem('camello.sharedText'); } catch {}
  }

  const precisionTexto = precision_m != null ? `±${Math.round(precision_m)} m` : 'Precisión no disponible';

  return (
    <div className="ubicacion-selector">
      <div className="fila-botones">
        <button type="button" className="boton-primario" onClick={() => void gps()} disabled={obteniendo}>
          📡 {obteniendo ? 'Buscando GPS…' : 'Ubicación actual'}
        </button>
        {onOmitir && (
          <button type="button" className="boton-secundario" onClick={onOmitir}>
            Omitir
          </button>
        )}
      </div>

      <div className="ubicacion-paste">
        <label>
          Pegar ubicación de WhatsApp / Google Maps
          <input
            value={pegado}
            onChange={(e) => setPegado(e.target.value)}
            placeholder="https://maps.google.com/?q=4.14,-73.62"
          />
        </label>
        <button type="button" className="boton-secundario" onClick={() => void pegar()} disabled={!pegado.trim()}>
          Pegar ubicación
        </button>
      </div>

      <div className="contenedor-mapa ubicacion-mini-mapa" ref={contenedorRef} />
      {lat != null && lng != null && (
        <div className="ubicacion-datos">
          <strong>{precisionTexto}</strong>
          <span>{lat.toFixed(6)}, {lng.toFixed(6)}</span>
          <span>Fuente: {fuente ?? 'manual'}</span>
          {precision_m != null && precision_m > 50 && (
            <span className="texto-alerta">Más de 50 m: revisa el pin o reintenta el GPS antes de guardar.</span>
          )}
        </div>
      )}
      {mensaje && <p className="banner-info">{mensaje}</p>}
      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}
