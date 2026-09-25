const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const ITERACIONES = 180000;
const enc = new TextEncoder();
const dec = new TextDecoder();
import { bytesToBase64, base64ToBytes } from './base64';

type RespaldoCifrado = {
  camello_encrypted_backup_version?: unknown;
  iv?: unknown;
  salt?: unknown;
  ciphertext?: unknown;
};

function esRespaldoCifrado(value: unknown): value is RespaldoCifrado {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'camello_encrypted_backup_version' in value
    && 'iv' in value
    && 'salt' in value
    && 'ciphertext' in value;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function b64(bytes: Uint8Array): string { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function bytes(s: string): Uint8Array { const b=atob(s); const out=new Uint8Array(b.length); for(let i=0;i<b.length;i+=1) out[i]=b.charCodeAt(i); return out; }
async function keyFromPassword(password:string,salt:Uint8Array){
  const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:toArrayBuffer(salt),iterations:ITERACIONES,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function cifrarRespaldo(texto:string,password:string):Promise<string>{
  if(new TextEncoder().encode(texto).byteLength>MAX_BACKUP_BYTES) throw new Error('El respaldo supera 25 MB.');
  if(password.length<10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ivBuffer = toArrayBuffer(iv);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:ivBuffer},await keyFromPassword(password,salt),enc.encode(texto));
  return JSON.stringify({camello_encrypted_backup_version:1,kdf:'PBKDF2-SHA256',iterations:ITERACIONES,salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(cipher))});
}
export async function descifrarRespaldo(texto:string,password:string):Promise<string>{
  if(new TextEncoder().encode(texto).byteLength>MAX_BACKUP_BYTES) throw new Error('El respaldo supera 25 MB.');
  const parsed: unknown = JSON.parse(texto);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Formato de respaldo cifrado no reconocido.');
  // JSON.parse devuelve unknown: el type guard valida la estructura antes de leer los campos.
  if (!esRespaldoCifrado(parsed)) throw new Error('Formato de respaldo cifrado no reconocido.');
  const data = parsed;
  if(Number(data.camello_encrypted_backup_version)!==1) throw new Error('Formato de respaldo cifrado no reconocido.');
  try {
    const iv = base64ToBytes(String(data.iv));
    const salt = base64ToBytes(String(data.salt));
    const ciphertext = base64ToBytes(String(data.ciphertext));
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:toArrayBuffer(iv)},await keyFromPassword(password,salt),toArrayBuffer(ciphertext));
    return dec.decode(plain);
  } catch { throw new Error('Contraseña incorrecta o respaldo cifrado alterado.'); }
}
export const LIMITE_RESPALDO_BYTES = MAX_BACKUP_BYTES;
