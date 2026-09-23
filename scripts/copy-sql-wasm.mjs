import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const destination = resolve('public/assets/sql-wasm.wasm');

try {
  await access(source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log('Copied sql-wasm.wasm to ' + destination);
} catch (error) {
  console.error('No se pudo preparar sql-wasm.wasm para la web.', error);
  process.exitCode = 1;
}
