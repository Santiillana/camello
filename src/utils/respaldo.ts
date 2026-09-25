const CLAVE_ULTIMO_RESPALDO = 'camello.ultimoRespaldoAt';

export function registrarExportacionRespaldo(date = new Date()): void {
  try { localStorage.setItem(CLAVE_ULTIMO_RESPALDO, date.toISOString()); } catch { /* localStorage puede estar bloqueado por el navegador; el respaldo principal sigue siendo válido. */ }
}

export function diasDesdeUltimoRespaldo(now = new Date()): number | null {
  try {
    const valor = localStorage.getItem(CLAVE_ULTIMO_RESPALDO);
    if (!valor) return null;
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return null;
    return Math.floor(Math.max(0, now.getTime() - fecha.getTime()) / 86_400_000);
  } catch { return null; }
}

export function descargarArchivoTexto(contenido: string, nombreArchivo: string, tipo = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function descargarRespaldo(json: string, date = new Date()): void {
  descargarArchivoTexto(json, 'camello-respaldo-' + date.toISOString().slice(0, 10) + '.json', 'application/json;charset=utf-8');
}


export async function calcularChecksum(texto: string): Promise<string> {
  const data = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
