import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const appPackage = readJson(join(root, 'package.json'));
const expectedSqlJsVersion = appPackage.dependencies?.['sql.js'];

if (!expectedSqlJsVersion || !/^\d+\.\d+\.\d+$/.test(expectedSqlJsVersion)) {
  throw new Error(
    'CAMELLO: dependencies.sql.js debe fijar una versión exacta para mantener alineado el WASM.'
  );
}

const jeepPackagePath = require.resolve('jeep-sqlite/package.json', { paths: [root] });
const jeepPackage = readJson(jeepPackagePath);
const sqlJsPackagePath = require.resolve('sql.js/package.json', {
  paths: [dirname(jeepPackagePath)],
});
const sqlJsPackage = readJson(sqlJsPackagePath);
const wasmSource = require.resolve('sql.js/dist/sql-wasm.wasm', {
  paths: [dirname(jeepPackagePath)],
});

if (sqlJsPackage.version !== expectedSqlJsVersion) {
  throw new Error(
    `CAMELLO: sql.js desincronizado. package.json=${expectedSqlJsVersion}, instalado=${sqlJsPackage.version}.`
  );
}

const declaredRange = jeepPackage.dependencies?.['sql.js'];
if (!declaredRange?.startsWith('^')) {
  throw new Error(
    `CAMELLO: no se pudo validar el rango de sql.js declarado por jeep-sqlite: ${String(declaredRange)}`
  );
}

const [major, minor, patch] = sqlJsPackage.version.split('.').map(Number);
const [rangeMajor, rangeMinor, rangePatch] = declaredRange.slice(1).split('.').map(Number);
const satisfiesJeepRange =
  major === rangeMajor &&
  (minor > rangeMinor || (minor === rangeMinor && patch >= rangePatch));

if (!satisfiesJeepRange) {
  throw new Error(
    `CAMELLO: sql.js@${sqlJsPackage.version} no satisface jeep-sqlite@${jeepPackage.version} (${declaredRange}).`
  );
}

const target = join(root, 'public', 'assets', 'sql-wasm.wasm');
mkdirSync(dirname(target), { recursive: true });
copyFileSync(wasmSource, target);

const sourceHash = sha256(wasmSource);
const targetHash = sha256(target);

if (sourceHash !== targetHash) {
  throw new Error('CAMELLO: la copia de sql-wasm.wasm no coincide con la fuente.');
}

console.log(
  `CAMELLO: sql.js@${sqlJsPackage.version} -> public/assets/sql-wasm.wasm (${sourceHash})`
);
