import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type UbicacionFuente = 'gps' | 'whatsapp' | 'manual';

export type Coordenadas = {
  lat: number;
  lng: number;
  precision_m?: number;
  fuente: UbicacionFuente;
  fecha?: string;
};

const LAT_DEFAULT = 4.142;
const LNG_DEFAULT = -73.6266;
const COLOMBIA = { latMin: -4.3, latMax: 12.5, lngMin: -79.1, lngMax: -66.8 };

function normalizarNumero(valor: string): number {
  return Number(valor.replace(',', '.'));
}

function aplicarHemisferio(valor: number, hemisferio?: string): number {
  if (!hemisferio) return valor;
  const signo = /[SW]/i.test(hemisferio) ? -1 : 1;
  return Math.abs(valor) * signo;
}

export function coordenadasValidas(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function coordenadasParecenInvertidas(lat: number, lng: number): boolean {
  return !estaEnColombia(lat, lng) && estaEnColombia(lng, lat);
}

export function estaEnColombia(lat: number, lng: number): boolean {
  return lat >= COLOMBIA.latMin && lat <= COLOMBIA.latMax && lng >= COLOMBIA.lngMin && lng <= COLOMBIA.lngMax;
}

export function advertenciaCoordenadas(lat: number, lng: number): string | null {
  if (!coordenadasValidas(lat, lng)) return 'Las coordenadas están fuera de rango.';
  if (coordenadasParecenInvertidas(lat, lng)) return 'Las coordenadas parecen estar invertidas: revisa latitud y longitud.';
  if (!estaEnColombia(lat, lng)) return 'La ubicación queda fuera de Colombia. Verifica que las coordenadas sean correctas.';
  return null;
}

function convertirPar(latRaw: string, latDir: string | undefined, lngRaw: string, lngDir: string | undefined) {
  const lat = aplicarHemisferio(normalizarNumero(latRaw), latDir);
  const lng = aplicarHemisferio(normalizarNumero(lngRaw), lngDir);
  return coordenadasValidas(lat, lng) ? { lat, lng } : null;
}

function buscarCoordenadasEnTexto(texto: string) {
  const decimal = /([+-]?d+(?:[.,]d+)?)(?:s*°s*)?s*([NS])?s*[,;s]s*([+-]?d+(?:[.,]d+)?)(?:s*°s*)?s*([EW])?/i;
  const match = texto.match(decimal);
  return match ? convertirPar(match[1], match[2], match[3], match[4]) : null;
}

function buscarGeo(texto: string) {
  const match = texto.match(/geo:s*([+-]?d+(?:.d+)?)s*,s*([+-]?d+(?:.d+)?)/i);
  return match ? convertirPar(match[1], undefined, match[2], undefined) : null;
}

function buscarGoogleMaps(texto: string) {
  const urls = texto.match(/https?://[^s<>"']+/gi) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(raw.replace(/[),.;]+$/, ''));
      const q = url.searchParams.get('q') ?? url.searchParams.get('ll');
      const query = q?.match(/s*([+-]?d+(?:[.,]d+)?)s*,s*([+-]?d+(?:[.,]d+)?)/);
      if (query) {
        const directo = convertirPar(query[1], undefined, query[2], undefined);
        if (directo) return directo;
      }

      const at = url.pathname.match(/@([+-]?d+(?:.d+)?),([+-]?d+(?:.d+)?)/);
      if (at) {
        const directo = convertirPar(at[1], undefined, at[2], undefined);
        if (directo) return directo;
      }
    } catch {
      // Se intenta el siguiente enlace.
    }
  }

  const inline = texto.match(/!3d([+-]?d+(?:.d+)?)!4d([+-]?d+(?:.d+)?)/);
  return inline ? convertirPar(inline[1], undefined, inline[2], undefined) : null;
}

export function parsearUbicacion(texto: string): { lat: number; lng: number } | null {
  const valor = texto.trim();
  if (!valor) return null;
  return buscarGeo(valor) ?? buscarGoogleMaps(valor) ?? buscarCoordenadasEnTexto(valor);
}

const DOMINIOS_GOOGLE = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
]);

function hostGooglePermitido(valor: string): boolean {
  try {
    return DOMINIOS_GOOGLE.has(new URL(valor).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function resolverUbicacionPegada(texto: string): Promise<Coordenadas> {
  const directa = parsearUbicacion(texto);
  if (directa) return { ...directa, fuente: 'whatsapp', fecha: new Date().toISOString() };

  const enlaces = texto.match(/https?://[^s<>"']+/gi) ?? [];
  const corto = enlaces.find((enlace) => {
    try {
      const host = new URL(enlace).hostname.toLowerCase();
      return host === 'maps.app.goo.gl' || host === 'goo.gl';
    } catch {
      return false;
    }
  });

  if (!corto) throw new Error('FORMATO_NO_RECONOCIDO');
  if (!Capacitor.isNativePlatform()) {
    throw new Error('El navegador no puede abrir enlaces cortos. Usa la app instalada, o abre el enlace en Google Maps y pega las coordenadas');
  }

  try {
    let actual = corto;
    for (let intento = 0; intento < 5; intento += 1) {
      if (!hostGooglePermitido(actual)) throw new Error('REDIRECCION_NO_PERMITIDA');
      const respuesta = await CapacitorHttp.request({
        url: actual,
        method: 'HEAD',
        disableRedirects: true,
        connectTimeout: 8000,
        readTimeout: 8000,
        responseType: 'text',
      });

      const encontrado = parsearUbicacion(respuesta.url);
      if (encontrado) return { ...encontrado, fuente: 'whatsapp', fecha: new Date().toISOString() };

      if (respuesta.status >= 300 && respuesta.status < 400) {
        const locationHeader = Object.entries(respuesta.headers ?? {}).find(([clave]) => clave.toLowerCase() === 'location')?.[1];
        if (!locationHeader) break;
        const siguiente = new URL(locationHeader, actual).toString();
        if (!hostGooglePermitido(siguiente)) throw new Error('REDIRECCION_NO_PERMITIDA');
        actual = siguiente;
        continue;
      }
      const porCuerpo = parsearUbicacion(String(respuesta.data ?? ''));
      if (porCuerpo) return { ...porCuerpo, fuente: 'whatsapp', fecha: new Date().toISOString() };
      break;
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'REDIRECCION_NO_PERMITIDA') {
      throw new Error('El enlace corto redirige fuera de Google Maps y fue bloqueado por seguridad.');
    }
    throw new Error('No se pudo abrir el enlace corto de Google Maps. Comprueba la conexión o abre el enlace en Google Maps y pega las coordenadas.');
  }

  throw new Error('FORMATO_NO_RECONOCIDO');
}

async function obtenerGpsWeb(duracionMs: number, umbralExcelenteM: number): Promise<Coordenadas> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('El GPS requiere la app instalada (el navegador bloquea el GPS en http).');
  }
  if (!navigator.geolocation) throw new Error('Este dispositivo no ofrece GPS en este momento.');

  return new Promise((resolve, reject) => {
    let mejor: Coordenadas | null = null;
    let terminado = false;
    let watchId: number | null = null;
    const timer = window.setTimeout(finalizar, duracionMs);

    function finalizar() {
      if (terminado) return;
      terminado = true;
      window.clearTimeout(timer);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (mejor) resolve(mejor);
      else reject(new Error('No se pudo obtener una ubicación. Revisa el permiso de ubicación y prueba de nuevo.'));
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!coordenadasValidas(pos.coords.latitude, pos.coords.longitude)) return;
        const candidata: Coordenadas = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
          fuente: 'gps',
          fecha: new Date(pos.timestamp).toISOString(),
        };
        if (!mejor || (candidata.precision_m ?? Infinity) < (mejor.precision_m ?? Infinity)) mejor = candidata;
        if ((mejor.precision_m ?? Infinity) <= umbralExcelenteM) finalizar();
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) reject(new Error('GPS_PERMISSION_DENIED'));
        else if (error.code === error.TIMEOUT) finalizar();
        else reject(new Error('No se pudo obtener el GPS. Puedes pegar o introducir las coordenadas manualmente.'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  });
}

export async function obtenerMejorUbicacion(
  duracionMs = 4500,
  umbralExcelenteM = 50,
): Promise<Coordenadas> {
  if (!Capacitor.isNativePlatform()) return obtenerGpsWeb(duracionMs, umbralExcelenteM);

  try {
    const permisos = await Geolocation.checkPermissions();
    if (permisos.location !== 'granted') {
      const solicitados = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (solicitados.location !== 'granted') throw new Error('GPS_PERMISSION_DENIED');
    }

    return await new Promise<Coordenadas>((resolve, reject) => {
      let mejor: Coordenadas | null = null;
      let terminado = false;
      let watchId: string | null = null;
      const timer = window.setTimeout(finalizar, duracionMs);

      function finalizar() {
        if (terminado) return;
        terminado = true;
        window.clearTimeout(timer);
        if (watchId != null) void Geolocation.clearWatch({ id: watchId });
        if (mejor) resolve(mejor);
        else reject(new Error('No se pudo obtener una ubicación. Revisa que el GPS esté encendido y el permiso concedido.'));
      }

      void Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
          minimumUpdateInterval: 1000,
        },
        (position, error) => {
          if (error) {
            if (String(error.code ?? '').includes('PERMISSION')) reject(new Error('GPS_PERMISSION_DENIED'));
            return;
          }
          if (!position || !coordenadasValidas(position.coords.latitude, position.coords.longitude)) return;
          const candidata: Coordenadas = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            precision_m: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
            fuente: 'gps',
            fecha: new Date(position.timestamp).toISOString(),
          };
          if (!mejor || (candidata.precision_m ?? Infinity) < (mejor.precision_m ?? Infinity)) mejor = candidata;
          if ((mejor.precision_m ?? Infinity) <= umbralExcelenteM) finalizar();
        },
      ).then((id) => {
        watchId = id;
      }).catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'GPS_PERMISSION_DENIED') {
      throw new Error('GPS_PERMISSION_DENIED');
    }
    throw error;
  }
}

export function coordenadasIniciales(): { lat: number; lng: number } {
  return { lat: LAT_DEFAULT, lng: LNG_DEFAULT };
}
