import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const candidates = [
  join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  join(root, 'node_modules', 'jeep-sqlite', 'dist', 'assets', 'sql-wasm.wasm'),
  join(root, 'node_modules', '@capacitor-community', 'sqlite', 'dist', 'esm', 'web', 'sql-wasm.wasm'),
];

const source = candidates.find(existsSync);
if (!source) {
  console.warn('CAMELLO: no se encontró sql-wasm.wasm durante postinstall. La instalación continúa.');
  process.exit(0);
}

const target = join(root, 'public', 'assets', 'sql-wasm.wasm');
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('CAMELLO: SQLite WASM preparado en public/assets/sql-wasm.wasm');
