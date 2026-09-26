import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { crearHashPin, verificarHashPin } from '../src/utils/seguridad.ts';
import { cifrarRespaldo, descifrarRespaldo } from '../src/utils/respaldoCifrado.ts';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
if (!globalThis.btoa) Object.defineProperty(globalThis, 'btoa', { value: (s: string) => Buffer.from(s, 'binary').toString('base64'), configurable: true });
if (!globalThis.atob) Object.defineProperty(globalThis, 'atob', { value: (s: string) => Buffer.from(s, 'base64').toString('binary'), configurable: true });

execFileSync('npm', ['audit', '--audit-level=high'], { stdio: 'inherit' });

const pin = await crearHashPin('123456');
assert.ok(pin.hash && pin.salt);
assert.equal(await verificarHashPin('123456',pin.hash,pin.salt),true);
assert.equal(await verificarHashPin('654321',pin.hash,pin.salt),false);
await assert.rejects(()=>crearHashPin('12345'));

const plano = JSON.stringify({datos:'CAMELLO',clientes:[{nombre:'Prueba'}]});
const cifrado = await cifrarRespaldo(plano,'contraseña-segura');
assert.notEqual(cifrado,plano);
assert.equal(await descifrarRespaldo(cifrado,'contraseña-segura'),plano);
await assert.rejects(()=>descifrarRespaldo(cifrado,'otra-contraseña'));
const alterado = JSON.stringify({...JSON.parse(cifrado),ciphertext:'AAAA'});
await assert.rejects(()=>descifrarRespaldo(alterado,'contraseña-segura'));
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(path);
  }
}
walk(resolve('src'));

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/innerHTML|dangerouslySetInnerHTML/.test(text)) throw new Error('Seguridad: HTML dinámico inseguro en ' + file);
  if (/\b(console\.log|console\.error)\s*\(/.test(text) && !file.endsWith('/src/hooks/useBorrador.ts')) {
    throw new Error('Seguridad: log de datos potencialmente sensibles en ' + file);
  }
  if (/\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/.test(text) && !/utils\/ubicacion/.test(file)) {
    throw new Error('Seguridad: conexión externa fuera del módulo permitido en ' + file);
  }
}
const configText = readFileSync(resolve('capacitor.config.ts'), 'utf8');
if (!/androidIsEncryption\s*:\s*false/.test(configText)) {
  throw new Error('Seguridad: el cifrado nativo de SQLite debe permanecer deshabilitado por configuración del proyecto.');
}
const dbText = readFileSync(resolve('src/db/database.ts'), 'utf8');
const parametrizedQueryCount = (dbText.match(/(?:SELECT|INSERT|UPDATE|DELETE)[^;]+\?/gi) ?? []).length;
if (parametrizedQueryCount < 25) throw new Error('Seguridad: el corpus de SQL parametrizado cayó por debajo del umbral esperado.');
if (/\.query\(\s*['"](?:SELECT|INSERT|UPDATE|DELETE)[^'"]*\$\{/i.test(dbText)) {
  throw new Error('Seguridad: interpolación directa de variables en SQL detectada.');
}
console.log('verify-security: PASÓ — PBKDF2/PIN, AES-GCM de respaldos, entradas peligrosas, HTML dinámico, logs, SQL parametrizado y SQLite nativo sin cifrado.');

