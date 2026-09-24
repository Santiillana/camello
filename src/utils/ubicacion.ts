export type UbicacionFuente = 'gps' | 'whatsapp' | 'manual';

export type Coordenadas = {
  lat: number;
  lng: number;
  precision_m?: number;
  fuente: UbicacionFuente;
};

const LAT_DEFAULT = 4.142;
const LNG_DEFAULT = -73.6266;

export function coordenadasValidas(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function parsearUbicacion(texto: string): { lat: number; lng: number } | null {
  const valor = texto.trim();
  if (!valor) return null;

  const geo = valor.match(/^geo:([+-]?(?:\d+(?:\.\d+)?))(?:,)([+-]?(?:\d+(?:\.\d+)?))/i);
  if (geo) {
    const lat = Number(geo[1]);
    const lng = Number(geo[2]);
    return coordenadasValidas(lat, lng) ? { lat, lng } : null;
  }

  try {
    const url = new URL(valor);
    const q = url.searchParams.get('q');
    const desdeQuery = q?.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/);
    if (desdeQuery) {
      const lat = Number(desdeQuery[1]);
      const lng = Number(desdeQuery[2]);
      if (coordenadasValidas(lat, lng)) return { lat, lng };
    }

    const at = url.pathname.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/);
    if (at) {
      const lat = Number(at[1]);
      const lng = Number(at[2]);
      if (coordenadasValidas(lat, lng)) return { lat, lng };
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolverUbicacionPegada(texto: string): Promise<Coordenadas | null> {
  const directa = parsearUbicacion(texto);
  if (directa) return { ...directa, fuente: 'whatsapp' };

  const valor = texto.trim();
  if (!/^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl)\//i.test(valor)) return null;

  try {
    const respuesta = await fetch(valor, { method: 'HEAD', redirect: 'follow' });
    const resuelto = parsearUbicacion(respuesta.url);
    if (resuelto) return { ...resuelto, fuente: 'whatsapp' };
  } catch {
    // Sin internet o sin permiso CORS: la UI mostrará una alternativa manual.
  }

  return null;
}

export async function obtenerMejorUbicacion(
  duracionMs = 4500,
  umbralExcelenteM = 50,
): Promise<Coordenadas> {
  if (!navigator.geolocation) throw new Error('Este dispositivo no ofrece GPS en este momento.');

  return new Promise((resolve, reject) => {
    let mejor: Coordenadas | null = null;
    let terminado = false;
    let watchId: number | null = null;

    const finalizar = () => {
      if (terminado) return;
      terminado = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (!mejor) {
        reject(new Error('No se pudo obtener una ubicación. Revisa el permiso de ubicación y prueba de nuevo.'));
        return;
      }
      resolve(mejor);
    };

    const timer = window.setTimeout(() => {
      if (mejor && (mejor.precision_m ?? Infinity) <= umbralExcelenteM) {
        finalizar();
      } else if (mejor) {
        finalizar();
      } else {
        finalizar();
      }
    }, duracionMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const precision = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined;
        if (!coordenadasValidas(pos.coords.latitude, pos.coords.longitude)) return;
        const candidato: Coordenadas = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision_m: precision,
          fuente: 'gps',
        };
        if (!mejor || (precision ?? Infinity) < (mejor.precision_m ?? Infinity)) mejor = candidato;
        if ((mejor.precision_m ?? Infinity) <= umbralExcelenteM) {
          window.clearTimeout(timer);
          finalizar();
        }
      },
      (error) => {
        window.clearTimeout(timer);
        if (error.code === error.PERMISSION_DENIED) reject(new Error('El permiso de ubicación fue denegado. Puedes pegar o introducir las coordenadas manualmente.'));
        else if (error.code === error.TIMEOUT) finalizar();
        else reject(new Error('No se pudo obtener el GPS. Puedes pegar o introducir las coordenadas manualmente.'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
  });
}

export function coordenadasIniciales(): { lat: number; lng: number } {
  return { lat: LAT_DEFAULT, lng: LNG_DEFAULT };
}
