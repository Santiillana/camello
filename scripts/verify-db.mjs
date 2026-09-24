import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB_VERSION = 4;
const REQUIRED_TABLES = [
  'clientes',
  'mascotas',
  'productos',
  'rutas',
  'ventas',
  'configuracion_app',
  'fotos',
];

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono1 TEXT,
    telefono2 TEXT,
    cumple_dia INTEGER,
    cumple_mes INTEGER,
    fecha_registro TEXT NOT NULL,
    lat REAL,
    lng REAL,
    ubicacion_precision_m REAL,
    ubicacion_fuente TEXT,
    ubicacion_fecha TEXT,
    observaciones TEXT,
    estado TEXT NOT NULL DEFAULT 'activo'
  );`,
  `CREATE TABLE IF NOT EXISTS mascotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    cumple_dia INTEGER,
    cumple_mes INTEGER,
    sexo TEXT,
    raza TEXT,
    tamano TEXT,
    preferencias TEXT,
    observaciones TEXT,
    estado TEXT NOT NULL DEFAULT 'activo',
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );`,
  `CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio INTEGER NOT NULL,
    costo INTEGER NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS rutas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PROGRAMADA',
    fecha TEXT NOT NULL,
    fecha_planificada TEXT,
    hora_planificada TEXT,
    hora_inicio TEXT,
    hora_fin TEXT,
    lat_inicio REAL,
    lng_inicio REAL,
    lat_fin REAL,
    lng_fin REAL,
    paquetes_llevados INTEGER NOT NULL DEFAULT 0,
    notas TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    ruta_id INTEGER,
    producto_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_aplicado INTEGER NOT NULL,
    costo_aplicado INTEGER NOT NULL,
    total INTEGER NOT NULL,
    utilidad INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE',
    fecha_pago TEXT,
    metodo_pago TEXT NOT NULL DEFAULT 'EFECTIVO',
    monto_pagado INTEGER NOT NULL DEFAULT 0,
    operacion_id TEXT UNIQUE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (ruta_id) REFERENCES rutas(id),
    CHECK (monto_pagado >= 0 AND monto_pagado <= total)
  );`,
  `CREATE TABLE IF NOT EXISTS fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    referencia TEXT,
    data_url TEXT NOT NULL,
    creado_at TEXT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );`,
  `CREATE TABLE IF NOT EXISTS configuracion_app (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );`,
  'CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);',
  'CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);',
  'CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);',
  'CREATE INDEX IF NOT EXISTS idx_mascotas_cliente ON mascotas(cliente_id);',
  'CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado);',
  'CREATE INDEX IF NOT EXISTS idx_fotos_cliente ON fotos(cliente_id);',
];

function applySchema(db) {
  for (const statement of SCHEMA_STATEMENTS) db.run(statement);
}

function migrateVersion2(db) {
  const rows = db.exec('PRAGMA table_info(rutas);')[0]?.values ?? [];
  const columns = new Set(rows.map((row) => String(row[1])));
  if (!columns.has('nombre')) db.run("ALTER TABLE rutas ADD COLUMN nombre TEXT NOT NULL DEFAULT '';");
  if (!columns.has('fecha_planificada')) db.run('ALTER TABLE rutas ADD COLUMN fecha_planificada TEXT;');
  if (!columns.has('hora_planificada')) db.run('ALTER TABLE rutas ADD COLUMN hora_planificada TEXT;');
}

function columnMap(db, table) {
  const rows = db.exec('PRAGMA table_info(' + table + ');')[0]?.values ?? [];
  return new Map(rows.map((row) => [String(row[1]), String(row[2] ?? '').toUpperCase()]));
}

function migrateVersion3(db) {
  const productos = columnMap(db, 'productos');
  const ventas = columnMap(db, 'ventas');
  const productosListos = productos.get('precio') === 'INTEGER' && productos.get('costo') === 'INTEGER';
  const ventasListas = ventas.get('precio_aplicado') === 'INTEGER' && ventas.get('costo_aplicado') === 'INTEGER' && ventas.get('total') === 'INTEGER' && ventas.get('utilidad') === 'INTEGER' && ventas.has('metodo_pago') && ventas.has('monto_pagado') && ventas.has('operacion_id');
  if (productosListos && ventasListas) return;
  db.run('PRAGMA foreign_keys = OFF;');
  db.run('BEGIN TRANSACTION;');
  try {
    if (!productosListos) {
      db.run('ALTER TABLE productos RENAME TO productos_migracion_v3;');
      db.run('CREATE TABLE productos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, precio INTEGER NOT NULL, costo INTEGER NOT NULL, activo INTEGER NOT NULL DEFAULT 1);');
      db.run('INSERT INTO productos (id, nombre, precio, costo, activo) SELECT id, nombre, CAST(ROUND(precio) AS INTEGER), CAST(ROUND(costo) AS INTEGER), activo FROM productos_migracion_v3;');
      db.run('DROP TABLE productos_migracion_v3;');
    }
    if (!ventasListas) {
      db.run('DROP INDEX IF EXISTS idx_ventas_cliente;');
      db.run('DROP INDEX IF EXISTS idx_ventas_ruta;');
      db.run('DROP INDEX IF EXISTS idx_ventas_fecha;');
      const metodo = ventas.has('metodo_pago') ? "COALESCE(metodo_pago, CASE WHEN estado_pago = 'PAGADA' THEN 'EFECTIVO' ELSE 'FIADO' END)" : "CASE WHEN estado_pago = 'PAGADA' THEN 'EFECTIVO' ELSE 'FIADO' END";
      const monto = ventas.has('monto_pagado') ? "MIN(MAX(CAST(ROUND(COALESCE(monto_pagado, 0)) AS INTEGER), 0), CAST(ROUND(total) AS INTEGER))" : "CASE WHEN estado_pago = 'PAGADA' THEN CAST(ROUND(total) AS INTEGER) ELSE 0 END";
      const operacion = ventas.has('operacion_id') ? 'operacion_id' : 'NULL';
      db.run('ALTER TABLE ventas RENAME TO ventas_migracion_v3;');
      db.run("CREATE TABLE ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL, ruta_id INTEGER, producto_nombre TEXT NOT NULL, cantidad INTEGER NOT NULL DEFAULT 1, precio_aplicado INTEGER NOT NULL, costo_aplicado INTEGER NOT NULL, total INTEGER NOT NULL, utilidad INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE', fecha_pago TEXT, metodo_pago TEXT NOT NULL DEFAULT 'EFECTIVO', monto_pagado INTEGER NOT NULL DEFAULT 0, operacion_id TEXT UNIQUE, FOREIGN KEY (cliente_id) REFERENCES clientes(id), FOREIGN KEY (ruta_id) REFERENCES rutas(id), CHECK (monto_pagado >= 0 AND monto_pagado <= total));");
      db.run('INSERT INTO ventas (id, cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago, metodo_pago, monto_pagado, operacion_id) SELECT id, cliente_id, ruta_id, producto_nombre, cantidad, CAST(ROUND(precio_aplicado) AS INTEGER), CAST(ROUND(costo_aplicado) AS INTEGER), CAST(ROUND(total) AS INTEGER), CAST(ROUND(utilidad) AS INTEGER), fecha, hora, estado_pago, fecha_pago, ' + metodo + ', ' + monto + ', ' + operacion + ' FROM ventas_migracion_v3;');
      db.run('DROP TABLE ventas_migracion_v3;');
    }
    db.run('CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);');
    db.run('CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);');
    db.run('CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);');
    db.run('COMMIT;');
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch {}
    throw error;
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }
}
function migrateVersion4(db) {
  const rows = db.exec('PRAGMA table_info(clientes);')[0]?.values ?? [];
  const columns = new Set(rows.map((row) => String(row[1])));
  if (!columns.has('ubicacion_precision_m')) db.run('ALTER TABLE clientes ADD COLUMN ubicacion_precision_m REAL;');
  if (!columns.has('ubicacion_fuente')) db.run('ALTER TABLE clientes ADD COLUMN ubicacion_fuente TEXT;');
  if (!columns.has('ubicacion_fecha')) db.run('ALTER TABLE clientes ADD COLUMN ubicacion_fecha TEXT;');
  db.run(`CREATE TABLE IF NOT EXISTS fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    referencia TEXT,
    data_url TEXT NOT NULL,
    creado_at TEXT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );`);
  db.run('CREATE INDEX IF NOT EXISTS idx_fotos_cliente ON fotos(cliente_id);');
}

function initialize(db) {
  applySchema(db);
  const currentVersion = Number(db.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0] ?? 0);

  if (currentVersion > DB_VERSION) {
    throw new Error(`Esquema ${currentVersion} incompatible con ${DB_VERSION}`);
  }

  // Se ejecuta también cuando ya figura como aplicada para reparar columnas
  // que falten por una actualización anterior incompleta.
  migrateVersion2(db);
  migrateVersion3(db);
  migrateVersion4(db);
  db.run(`PRAGMA user_version = ${DB_VERSION};`);
  assertRequiredTables(db, 'inicialización');
}

function assertRequiredTables(db, label) {
  const rows = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table';",
  )[0]?.values ?? [];
  const names = new Set(rows.map((row) => String(row[0])));
  const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
  if (missing.length) {
    throw new Error(`${label}: faltan tablas ${missing.join(', ')}`);
  }
}

function loadFixture(SQL, fileName) {
  const db = new SQL.Database();
  const sql = readFileSync(new URL('./fixtures/' + fileName, import.meta.url), 'utf8');
  db.run(sql);
  return db;
}

function resumenDatos(db) {
  const tablas = ['clientes', 'mascotas', 'productos', 'rutas', 'ventas'];
  const resumen = Object.fromEntries(
    tablas.map((tabla) => [
      tabla,
      Number(db.exec('SELECT COUNT(*) FROM ' + tabla + ';')[0]?.values?.[0]?.[0] ?? 0),
    ]),
  );
  const venta = db.exec('SELECT COALESCE(SUM(total), 0), COALESCE(SUM(utilidad), 0) FROM ventas;')[0]?.values?.[0] ?? [0, 0];
  resumen.total_ventas = Number(venta[0] ?? 0);
  resumen.total_utilidad = Number(venta[1] ?? 0);
  return resumen;
}

function assertMismaCargaAntesDespues(antes, despues, label) {
  for (const clave of Object.keys(antes)) {
    if (antes[clave] !== despues[clave]) {
      throw new Error(
        label + ': cambió ' + clave + ' de ' + antes[clave] + ' a ' + despues[clave],
      );
    }
  }
}

function assertUserVersion(db, expected, label) {
  const version = Number(db.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0] ?? 0);
  if (version !== expected) throw new Error(label + ': user_version = ' + version);
}

const SQL = await initSqlJs({
  locateFile: (file) => fileURLToPath(new URL('../node_modules/sql.js/dist/' + file, import.meta.url)),
});

// a) Base completamente nueva.
const fresh = new SQL.Database();
initialize(fresh);
fresh.run('PRAGMA foreign_keys = ON;');
fresh.run("INSERT INTO clientes (id, nombre, fecha_registro) VALUES (1, 'Cliente de prueba', '2026-09-24');");
const freshConfig = fresh.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'configuracion_app';",
)[0]?.values?.length ?? 0;
if (freshConfig !== 1) throw new Error('base nueva: configuracion_app no existe');
assertRequiredTables(fresh, 'base nueva');
assertUserVersion(fresh, DB_VERSION, 'base nueva');

const productTypes = new Map(
  (fresh.exec('PRAGMA table_info(productos);')[0]?.values ?? [])
    .map((row) => [String(row[1]), String(row[2]).toUpperCase()]),
);
for (const field of ['precio', 'costo']) {
  if (productTypes.get(field) !== 'INTEGER') {
    throw new Error('base nueva: productos.' + field + ' no usa INTEGER');
  }
}
const saleTypes = new Map(
  (fresh.exec('PRAGMA table_info(ventas);')[0]?.values ?? [])
    .map((row) => [String(row[1]), String(row[2]).toUpperCase()]),
);
for (const field of ['precio_aplicado', 'costo_aplicado', 'total', 'utilidad', 'monto_pagado']) {
  if (saleTypes.get(field) !== 'INTEGER') {
    throw new Error('base nueva: ventas.' + field + ' no usa INTEGER');
  }
}

fresh.run("INSERT INTO ventas (cliente_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, metodo_pago, monto_pagado, operacion_id) VALUES (1, 'Prueba', 2, 13000, 7000, 26000, 12000, '2026-09-24', '10:00', 'PAGADA', 'EFECTIVO', 26000, 'op-1');");
let duplicadoRechazado = false;
try {
  fresh.run("INSERT INTO ventas (cliente_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, metodo_pago, monto_pagado, operacion_id) VALUES (1, 'Prueba', 2, 13000, 7000, 26000, 12000, '2026-09-24', '10:00', 'PAGADA', 'EFECTIVO', 26000, 'op-1');");
} catch {
  duplicadoRechazado = true;
}
if (!duplicadoRechazado) throw new Error('base nueva: operacion_id permite duplicados');

fresh.run('BEGIN TRANSACTION;');
fresh.run("INSERT INTO ventas (cliente_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, metodo_pago, monto_pagado, operacion_id) VALUES (1, 'Rollback', 1, 1000, 600, 1000, 400, '2026-09-24', '10:01', 'PENDIENTE', 'FIADO', 0, 'op-rollback');");
fresh.run('ROLLBACK;');
const rollbackCount = Number(fresh.exec("SELECT COUNT(*) FROM ventas WHERE operacion_id = 'op-rollback';")[0].values[0][0]);
if (rollbackCount !== 0) throw new Error('base nueva: la transacción no hizo rollback');

const fixtureV1 = loadFixture(SQL, 'schema-v1.sql');
const antesV1 = resumenDatos(fixtureV1);
initialize(fixtureV1);
const despuesV1 = resumenDatos(fixtureV1);
assertMismaCargaAntesDespues(antesV1, despuesV1, 'migración v1→v3');
assertUserVersion(fixtureV1, DB_VERSION, 'migración v1→v3');
const clientV1 = fixtureV1.exec('SELECT nombre FROM clientes WHERE id = 1;')[0]?.values?.[0]?.[0];
if (clientV1 !== 'Cliente antiguo 1') throw new Error('migración v1→v3: se perdió un cliente');
const routeColumnsV1 = new Set(
  (fixtureV1.exec('PRAGMA table_info(rutas);')[0]?.values ?? []).map((row) => String(row[1])),
);
for (const required of ['nombre', 'fecha_planificada', 'hora_planificada']) {
  if (!routeColumnsV1.has(required)) throw new Error('migración v1→v3: falta rutas.' + required);
}

const fixtureV2 = loadFixture(SQL, 'schema-v2.sql');
const antesV2 = resumenDatos(fixtureV2);
initialize(fixtureV2);
const despuesV2 = resumenDatos(fixtureV2);
assertMismaCargaAntesDespues(antesV2, despuesV2, 'migración v2→v3');
assertUserVersion(fixtureV2, DB_VERSION, 'migración v2→v3');

fresh.close();
fixtureV1.close();
fixtureV2.close();

console.log('verify-db: OK');
console.log(JSON.stringify({
  base_nueva: 'PASÓ',
  migracion_v1_a_v3: { antes: antesV1, despues: despuesV1 },
  migracion_v2_a_v3: { antes: antesV2, despues: despuesV2 },
  enteros_cop: 'PASÓ',
  pago_atómico: 'PASÓ',
  anti_duplicado: 'PASÓ',
  rollback_sqljs: 'PASÓ',
}, null, 2));
