const enc = new TextEncoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(texto: string): Uint8Array {
  const binary = atob(texto);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function textToBase64(texto: string): string {
  return bytesToBase64(enc.encode(texto));
}

export function base64ToText(texto: string): string {
  return new TextDecoder().decode(base64ToBytes(texto));
}
