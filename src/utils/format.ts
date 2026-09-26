const ZONA_HORARIA = 'America/Bogota';

function partesBogota(date: Date) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return { year: valor('year'), month: valor('month'), day: valor('day'), hour: valor('hour'), minute: valor('minute') };
}

function pad2(valor: number): string {
  return String(valor).padStart(2, '0');
}

function isoDesdeCalendario(year: number, month: number, day: number): string {
  return year + '-' + pad2(month) + '-' + pad2(day);
}

function calendarioDesdeISO(iso: string): [number, number, number] | null {
  const [year, month, day] = iso.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return null;
  return [year, month, day];
}

export function fechaLocalISO(date = new Date()): string {
  const p = partesBogota(date);
  return isoDesdeCalendario(p.year, p.month, p.day);
}

export function horaLocalHHMM(date = new Date()): string {
  const p = partesBogota(date);
  return pad2(p.hour) + ':' + pad2(p.minute);
}

export function formatoMoneda(valor: number): string {
  return Math.trunc(valor).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export function formatoFecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  if (!a || !m || !d) return iso;
  return d + '/' + m + '/' + a;
}

export function hoyISO(): string {
  return fechaLocalISO();
}

export function inicioSemanaISO(base = new Date()): string {
  const calendario = calendarioDesdeISO(fechaLocalISO(base));
  if (!calendario) return fechaLocalISO(base);
  const fecha = new Date(Date.UTC(calendario[0], calendario[1] - 1, calendario[2]));
  const dia = fecha.getUTCDay() === 0 ? 7 : fecha.getUTCDay();
  fecha.setUTCDate(fecha.getUTCDate() - (dia - 1));
  return isoDesdeCalendario(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
}

export function inicioMesISO(base = new Date()): string {
  const calendario = calendarioDesdeISO(fechaLocalISO(base));
  if (!calendario) return fechaLocalISO(base);
  return isoDesdeCalendario(calendario[0], calendario[1], 1);
}

export function diasDesdeISO(iso: string, hoy = new Date()): number {
  const inicio = calendarioDesdeISO(iso);
  const actual = calendarioDesdeISO(fechaLocalISO(hoy));
  if (!inicio || !actual) return 0;
  const inicioUTC = Date.UTC(inicio[0], inicio[1] - 1, inicio[2]);
  const actualUTC = Date.UTC(actual[0], actual[1] - 1, actual[2]);
  return Math.max(0, Math.floor((actualUTC - inicioUTC) / 86_400_000));
}

export function sumarDiasISO(iso: string, dias: number): string {
  const partes = calendarioDesdeISO(iso);
  if (!partes || !Number.isInteger(dias)) return iso;
  const fecha = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return isoDesdeCalendario(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
}

export function diasEntreISO(desde: string, hasta: string): number {
  const a = calendarioDesdeISO(desde);
  const b = calendarioDesdeISO(hasta);
  if (!a || !b) return 0;
  return Math.abs(
    Math.floor((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000),
  );
}
