export const DEFAULT_ACCENT = '#c2642b';

function normalizarHex(color: string): string {
  const limpio = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(limpio)) return limpio.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(limpio)) {
    return '#' + limpio.slice(1).split('').map((c) => c + c).join('').toLowerCase();
  }
  return DEFAULT_ACCENT;
}

function oscurecerHex(color: string, factor = 0.82): string {
  const hex = normalizarHex(color).slice(1);
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return '#' + rgb.map((v) => Math.round(v * factor).toString(16).padStart(2, '0')).join('');
}

export function aplicarTema(color: string): void {
  const accent = normalizarHex(color);
  document.documentElement.style.setProperty('--color-acento', accent);
  document.documentElement.style.setProperty('--color-primario', accent);
  document.documentElement.style.setProperty('--color-primario-oscuro', oscurecerHex(accent));

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', accent);
}
