function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function fechaLocal(date: Date = new Date()): string {
  return String(date.getFullYear()) + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

export function horaLocal(date: Date = new Date()): string {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
}

export function diasDesdeFecha(iso: string | null | undefined, ahora: Date = new Date()): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const referencia = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.floor((hoy.getTime() - referencia.getTime()) / 86400000);
}

export function inicioSemanaLocalISO(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dia = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dia - 1));
  return fechaLocal(d);
}

export function inicioMesLocalISO(date: Date = new Date()): string {
  return String(date.getFullYear()) + '-' + pad2(date.getMonth() + 1) + '-01';
}

export function formatoMoneda(valor: number): string {
  return valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

export function formatoFecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export function hoyISO(): string {
  return fechaLocal();
}

export function inicioSemanaISO(): string {
  return inicioSemanaLocalISO();
}

export function inicioMesISO(): string {
  return inicioMesLocalISO();
}

export function telefonoWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.startsWith('57') && digitos.length >= 12) return digitos;
  return `57${digitos}`;
}
