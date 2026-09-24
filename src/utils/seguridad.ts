const ITERACIONES = 150000;
const enc = new TextEncoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}
function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
async function derive(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: ITERACIONES, hash: 'SHA-256' }, base, 256);
  return new Uint8Array(bits);
}
export async function crearHashPin(pin: string): Promise<{ hash: string; salt: string }> {
  if (!/^\d{6}$/.test(pin)) throw new Error('El PIN debe tener exactamente 6 dígitos.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: toBase64(await derive(pin, salt)), salt: toBase64(salt) };
}
export async function verificarHashPin(pin: string, hash: string, salt: string): Promise<boolean> {
  if (!/^\d{6}$/.test(pin)) return false;
  const got = await derive(pin, fromBase64(salt));
  const expected = fromBase64(hash);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i += 1) diff |= got[i] ^ expected[i];
  return diff === 0;
}
export { ITERACIONES };
