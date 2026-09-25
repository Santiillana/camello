import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  advertenciaCoordenadas,
  coordenadasIniciales,
  coordenadasValidas,
  obtenerMejorUbicacion,
  resolverUbicacionPegada,
  type Coordenadas,
} from '../utils/ubicacion';

type Props = {
  lat?: number;
  lng?: number;
  precision_m?: number | null;
  fuente?: Coordenadas['fuente'] | null;
  fecha?: string | null;
  onChange: (value: { lat: number; lng: number; precision_m?: number; fuente: Coordenadas['fuente']; fecha?: string }) => void;
  onOmitir?: () => void;
};

const ICONO_PIN = '<svg viewBox="0 0 40 50" width="40" height="50" aria-hidden="true"><path d="M20 48C20 48 4 29 4 18A16 16 0 1 1 36 18C36 29 20 48 20 48Z" fill="#c2642b" stroke="#111" stroke-width="2"/><circle cx="20" cy="18" r="6" fill="#fff"/></svg>';

export default function UbicacionSelector({ lat, lng, precision_m, fuente, fecha, onChange, onOmitir }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.Marker | null>(null);
  const [pegado, setPegado] = useState('');
  const [manualLat, setManualLat] = useState(lat != null ? String(lat) : '');
  const [manualLng, setManualLng] = useState(lng != null ? String(lng) : '');
  const [obteniendo, setObteniendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actual = lat != null && lng != null ? { lat, lng } : coordenadasIniciales();
  const advertencia = lat != null && lng != null ? advertenciaCoordenadas(lat, lng) : null;

  useEffect(() => {
    const recibirCompartido = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const texto = detail?.text?.trim();
      if (!texto) return;
      setPegado(texto);
      setMensaje('Ubicación compartida desde Android lista para procesar.');
      setError(null);
    };
    try {
      const compartido = localStorage.getItem('camello.sharedText');
      if (compartido) setPegado(compartido);
    } catch { /* El portapapeles compartido puede no estar disponible en el ciclo de vida actual de Android. */ }
    window.addEventListener('camelloShare', recibirCompartido);
    return () => window.removeEventListener('camelloShare', recibirCompartido);
  }, []);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([actual.lat, actual.lng], lat != null ? 16 : 13);
    mapaRef.current = mapa;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; colaboradores de OpenStreetMap' }).addTo(mapa);
    const icono = L.divIcon({ className: 'camello-pin', html: ICONO_PIN, iconSize: [40, 50], iconAnchor: [20, 48] });
    marcadorRef.current = L.marker([actual.lat, actual.lng], { draggable: true, icon: icono, keyboard: true, title: 'Ubicación del cliente' }).addTo(mapa);
    const actualizar = (posicion: L.LatLng, texto: string) => {
      if (!coordenadasValidas(posicion.lat, posicion.lng)) return;
      const fechaActual = new Date().toISOString();
      onChange({ lat: posicion.lat, lng: posicion.lng, fuente: 'manual', fecha: fechaActual });
      setManualLat(String(posicion.lat));
      setManualLng(String(posicion.lng));
      setMensaje(texto);
      setError(null);
    };
    marcadorRef.current.on('dragend', () => {
      const posicion = marcadorRef.current?.getLatLng();
      if (posicion) actualizar(posicion, 'Ubicación ajustada con el pin.');
    });
    mapa.on('click', (evento) => actualizar(evento.latlng, 'Ubicación ajustada tocando el mapa.'));
    return () => { mapa.stop(); mapa.remove(); mapaRef.current = null; marcadorRef.current = null; };
  }, []);

  useEffect(() => {
    setManualLat(lat != null ? String(lat) : '');
    setManualLng(lng != null ? String(lng) : '');
    if (!mapaRef.current || !marcadorRef.current) return;
    marcadorRef.current.setLatLng([actual.lat, actual.lng]);
    mapaRef.current.setView([actual.lat, actual.lng], lat != null ? 16 : 13);
  }, [lat, lng]);

  async function gps() {
    setObteniendo(true); setError(null); setMensaje(null);
    try {
      const resultado = await obtenerMejorUbicacion();
      onChange(resultado);
      setManualLat(String(resultado.lat)); setManualLng(String(resultado.lng));
      setMensaje(resultado.precision_m != null ? `GPS obtenido con ±${Math.round(resultado.precision_m)} m.` : 'GPS obtenido.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setObteniendo(false); }
  }

  async function pegar() {
    setError(null); setMensaje(null);
    try {
      const resultado = await resolverUbicacionPegada(pegado);
      onChange(resultado); setManualLat(String(resultado.lat)); setManualLng(String(resultado.lng));
      setMensaje('Ubicación pegada correctamente.');
      try { localStorage.removeItem('camello.sharedText'); } catch { /* El portapapeles compartido puede no estar disponible en el ciclo de vida actual de Android. */ }
    } catch (e: unknown) {
      const mensajeError = e instanceof Error ? e.message : String(e);
      setError(mensajeError === 'FORMATO_NO_RECONOCIDO' ? 'No reconocí coordenadas ni un enlace de Google Maps válido.' : mensajeError);
    }
  }

  function guardarManual() {
    const parsedLat = Number(manualLat.replace(',', '.'));
    const parsedLng = Number(manualLng.replace(',', '.'));
    if (!coordenadasValidas(parsedLat, parsedLng)) { setError('Escribe latitud y longitud válidas.'); return; }
    const fechaActual = new Date().toISOString();
    onChange({ lat: parsedLat, lng: parsedLng, fuente: 'manual', fecha: fechaActual });
    setMensaje('Coordenadas manuales guardadas.'); setError(null);
  }

  function abrirAjustes() {
    window.location.href = 'intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end';
  }

  const precisionTexto = precision_m != null ? `±${Math.round(precision_m)} m` : 'Precisión no disponible';
  const fechaTexto = fecha ? new Date(fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'No registrada';

  return (
    <div className="ubicacion-selector">
      <section className="ubicacion-metodo">
        <h3>1. Usar mi ubicación (GPS)</h3>
        <p className="detalle-cliente">Pide permiso al celular y busca varias lecturas de alta precisión.</p>
        <button type="button" className="boton-primario" onClick={() => void gps()} disabled={obteniendo}>{obteniendo ? 'Buscando GPS…' : 'Usar mi ubicación (GPS)'}</button>
        {error === 'GPS_PERMISSION_DENIED' && <button type="button" className="boton-secundario" onClick={abrirAjustes}>Abrir ajustes</button>}
      </section>
      <section className="ubicacion-metodo">
        <h3>2. Pegar enlace o coordenadas</h3>
        <p className="detalle-cliente">Acepta un mensaje completo de WhatsApp, coordenadas y enlaces largos o cortos de Google Maps.</p>
        <label>Ubicación<input value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="4.1420, -73.6266 o https://maps.google.com/?q=4.142,-73.626" /></label>
        <button type="button" className="boton-secundario" onClick={() => void pegar()} disabled={!pegado.trim()}>Pegar y ubicar</button>
      </section>
      <section className="ubicacion-metodo">
        <h3>3. Escribir coordenadas</h3>
        <div className="grid-dos-columnas">
          <label>Latitud<input value={manualLat} onChange={(e) => setManualLat(e.target.value)} inputMode="decimal" placeholder="4.1420" /></label>
          <label>Longitud<input value={manualLng} onChange={(e) => setManualLng(e.target.value)} inputMode="decimal" placeholder="-73.6266" /></label>
        </div>
        <p className="detalle-cliente">Cómo obtenerlas: en Google Maps mantén presionado el lugar, aparecen las coordenadas arriba, tócalas para copiarlas y pégalas aquí.</p>
        <button type="button" className="boton-secundario" onClick={guardarManual}>Guardar coordenadas</button>
      </section>
      <div className="contenedor-mapa ubicacion-mini-mapa" ref={contenedorRef} />
      {lat != null && lng != null && <div className="ubicacion-datos"><strong>{lat.toFixed(6)}, {lng.toFixed(6)}</strong><span>Precisión: {precisionTexto}</span><span>Fuente: {fuente ?? 'manual'}</span><span>Fecha: {fechaTexto}</span>{precision_m != null && precision_m > 50 && <span className="texto-alerta">Más de 50 m: mueve el pin o reintenta antes de guardar.</span>}{advertencia && <span className="texto-alerta">{advertencia}</span>}</div>}
      {mensaje && <p className="banner-exito">{mensaje}</p>}
      {error && <p className="texto-error" role="alert">{error}</p>}
      {onOmitir && <div className="fila-botones"><button type="button" className="boton-secundario" onClick={onOmitir}>Omitir</button></div>}
    </div>
  );
}