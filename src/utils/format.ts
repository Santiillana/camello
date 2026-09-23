function pad2(valor: number): string {
  return String(valor).padStart(2, '0');
}

export function fechaLocalISO(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function horaLocalHHMM(date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatoMoneda(valor: number): string {
  return valor.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });
}

export function formatoFecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
}

export function hoyISO(): string {
  return fechaLocalISO();
}

export function inicioSemanaISO(base = new Date()): string {
  const d = new Date(base);
  const dia = d.getDay() === 0 ? 7 : d.getDay();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - (dia - 1));
  return fechaLocalISO(d);
}

export function inicioMesISO(base = new Date()): string {
  const d = new Date(base);
  d.setDate(1);
  return fechaLocalISO(d);
}

export function diasDesdeISO(iso: string, hoy = new Date()): number {
  const [a, m, d] = iso.split('-').map(Number);
  if (![a, m, d].every(Number.isInteger)) return 0;

  const inicio = Date.UTC(a, m - 1, d);
  const actual = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.floor((actual - inicio) / 86_400_000));
}
