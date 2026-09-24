export type CoordenadasParseadas = { lat: number; lng: number };

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

export function buscarCoordenadasEnTexto(texto: string): CoordenadasParseadas | null {
  const match = texto.match(/([+-]?\d+(?:[.,]\d+)?)(?:\s*°\s*)?\s*([NS])?\s*[,;\s]\s*([+-]?\d+(?:[.,]\d+)?)(?:\s*°\s*)?\s*([EW])?/i);
  if (!match) return null;
  const lat = aplicarHemisferio(normalizarNumero(match[1]), match[2]);
  const lng = aplicarHemisferio(normalizarNumero(match[3]), match[4]);
  return coordenadasValidas(lat, lng) ? { lat, lng } : null;
}

export function parsearUbicacionPura(texto: string): CoordenadasParseadas | null {
  const valor = texto.trim();
  if (!valor) return null;

  const geo = valor.match(/geo:\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)/i);
  if (geo) {
    const lat = Number(geo[1]); const lng = Number(geo[2]);
    if (coordenadasValidas(lat, lng)) return { lat, lng };
  }

  const urls = valor.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const raw of urls) {
    try {
      const url = new URL(raw.replace(/[),.;]+$/, ''));
      const q = url.searchParams.get('q') ?? url.searchParams.get('ll');
      const query = q?.match(/\s*([+-]?\d+(?:[.,]\d+)?)\s*,\s*([+-]?\d+(?:[.,]\d+)?)/);
      if (query) {
        const lat = Number(query[1].replace(',', '.')); const lng = Number(query[2].replace(',', '.'));
        if (coordenadasValidas(lat, lng)) return { lat, lng };
      }
      const at = url.pathname.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/);
      if (at) {
        const lat = Number(at[1]); const lng = Number(at[2]);
        if (coordenadasValidas(lat, lng)) return { lat, lng };
      }
    } catch {}
  }

  const inline = valor.match(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/);
  if (inline) {
    const lat = Number(inline[1]); const lng = Number(inline[2]);
    if (coordenadasValidas(lat, lng)) return { lat, lng };
  }

  return buscarCoordenadasEnTexto(valor);
}

export function advertenciaCoordenadasPura(lat: number, lng: number): string | null {
  if (!coordenadasValidas(lat, lng)) return 'Las coordenadas están fuera de rango.';
  if (!(lat >= COLOMBIA.latMin && lat <= COLOMBIA.latMax && lng >= COLOMBIA.lngMin && lng <= COLOMBIA.lngMax) &&
      (lng >= COLOMBIA.latMin && lng <= COLOMBIA.latMax && lat >= COLOMBIA.lngMin && lat <= COLOMBIA.lngMax)) {
    return 'Las coordenadas parecen estar invertidas: revisa latitud y longitud.';
  }
  if (!(lat >= COLOMBIA.latMin && lat <= COLOMBIA.latMax && lng >= COLOMBIA.lngMin && lng <= COLOMBIA.lngMax)) {
    return 'La ubicación queda fuera de Colombia. Verifica que las coordenadas sean correctas.';
  }
  return null;
}
