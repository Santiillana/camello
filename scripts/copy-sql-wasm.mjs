import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const destination = resolve('public/assets/sql-wasm.wasm');
const expectedVersion = '1.11.0';

try {
  await access(source);
  const packageJson = JSON.parse(
    await readFile(resolve('node_modules/sql.js/package.json'), 'utf8'),
  );
  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `Se esperaba sql.js ${expectedVersion}, pero está instalada la versión ${String(packageJson.version)}.`,
    );
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log('Copied sql-wasm.wasm to ' + destination);
} catch (error) {
  console.error('No se pudo preparar sql-wasm.wasm para la web.', error);
  process.exitCode = 1;
}
