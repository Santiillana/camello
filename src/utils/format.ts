export function formatoMoneda(valor: number): string {
  return valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export function formatoFecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function inicioSemanaISO(): string {
  const d = new Date();
  const dia = d.getDay() === 0 ? 7 : d.getDay(); // lunes = 1 ... domingo = 7
  d.setDate(d.getDate() - (dia - 1));
  return d.toISOString().slice(0, 10);
}

export function inicioMesISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
