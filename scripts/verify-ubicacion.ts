import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  advertenciaCoordenadasPura,
  coordenadasValidas,
  parsearUbicacionPura,
} from '../src/utils/ubicacionParser.ts';

const casos: Array<[string, [number, number]]> = [
  ['4.1420, -73.6266', [4.142, -73.6266]],
  [' 4.1420 , -73.6266 ', [4.142, -73.6266]],
  ['4.1420 N, 73.6266 W', [4.142, -73.6266]],
  ['geo:4.1420,-73.6266', [4.142, -73.6266]],
  ['https://maps.google.com/?q=4.1420,-73.6266', [4.142, -73.6266]],
  ['https://maps.google.com/?ll=4.1420,-73.6266', [4.142, -73.6266]],
  ['https://www.google.com/maps/@4.1420,-73.6266,16z', [4.142, -73.6266]],
  ['https://www.google.com/maps/place/Villavicencio/@4.1420,-73.6266,16z', [4.142, -73.6266]],
  ['https://www.google.com/maps/data=!3d4.142!4d-73.6266', [4.142, -73.6266]],
  ['Mensaje WhatsApp: mira aquí https://maps.google.com/?q=4.1420,-73.6266 gracias', [4.142, -73.6266]],
];

for (const [entrada, esperado] of casos) {
  const obtenido = parsearUbicacionPura(entrada);
  assert.ok(obtenido, 'No se obtuvo coordenada para ' + entrada);
  assert.equal(Number(obtenido.lat.toFixed(6)), Number(esperado[0].toFixed(6)));
  assert.equal(Number(obtenido.lng.toFixed(6)), Number(esperado[1].toFixed(6)));
}

assert.equal(parsearUbicacionPura('texto sin coordenadas'), null);
assert.equal(parsearUbicacionPura('200, 300'), null);
assert.equal(coordenadasValidas(4.142, -73.6266), true);
assert.equal(coordenadasValidas(91, -73.6266), false);
assert.equal(
  advertenciaCoordenadasPura(-73.6266, 4.142)?.startsWith('Las coordenadas parecen estar invertidas'),
  true,
);
assert.match(
  advertenciaCoordenadasPura(40.7128, -74.006),
  /fuera de Colombia/,
);

console.log('ubicacion-parser: PASÓ — formatos directos, geo:, Google Maps, texto WhatsApp, rango e inversión.');

const miniMapa = readFileSync(new URL('../src/components/UbicacionMiniMapa.tsx', import.meta.url), 'utf8');
const mapaPrincipal = readFileSync(new URL('../src/pages/Mapa.tsx', import.meta.url), 'utf8');
assert.match(miniMapa, /L\.icon\(\{[\s\S]*?iconUrl: ICONO_PIN_URL/);
assert.match(miniMapa, /data:image\/svg\+xml/);
assert.doesNotMatch(mapaPrincipal, /L\.tileLayer\(/);
assert.doesNotMatch(mapaPrincipal, /tile\.openstreetmap\.org/);
console.log('mapa-local: PASÓ — icono Leaflet local y mapa principal sin raster remoto.');
