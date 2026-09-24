import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { crearHashPin, verificarHashPin } from '../src/utils/seguridad.ts';
import { cifrarRespaldo, descifrarRespaldo } from '../src/utils/respaldoCifrado.ts';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
if (!globalThis.btoa) Object.defineProperty(globalThis, 'btoa', { value: (s: string) => Buffer.from(s, 'binary').toString('base64'), configurable: true });
if (!globalThis.atob) Object.defineProperty(globalThis, 'atob', { value: (s: string) => Buffer.from(s, 'base64').toString('binary'), configurable: true });

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
console.log('verify-security: PASÓ — PBKDF2/PIN, AES-GCM, contraseña incorrecta y alteración rechazadas.');
