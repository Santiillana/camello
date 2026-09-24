import initSqlJs from 'sql.js';
import { fileURLToPath } from 'node:url';

const DB_VERSION = 2;
const REQUIRED_TABLES = [
  'clientes',
  'mascotas',
  'productos',
  'rutas',
  'ventas',
  'configuracion_app',
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
    precio REAL NOT NULL,
    costo REAL NOT NULL,
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
    precio_aplicado REAL NOT NULL,
    costo_aplicado REAL NOT NULL,
    total REAL NOT NULL,
    utilidad REAL NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE',
    fecha_pago TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (ruta_id) REFERENCES rutas(id)
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

function initialize(db) {
  applySchema(db);
  const currentVersion = Number(db.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0] ?? 0);

  if (currentVersion > DB_VERSION) {
    throw new Error(`Esquema ${currentVersion} incompatible con ${DB_VERSION}`);
  }

  // Se ejecuta también cuando ya figura como aplicada para reparar columnas
  // que falten por una actualización anterior incompleta.
  migrateVersion2(db);
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

function createLegacyDatabase(SQL) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha_registro TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activo'
  );`);
  db.run(`CREATE TABLE mascotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activo'
  );`);
  db.run(`CREATE TABLE productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    costo REAL NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
  );`);
  db.run(`CREATE TABLE rutas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'PROGRAMADA',
    fecha TEXT NOT NULL,
    hora_inicio TEXT,
    hora_fin TEXT,
    lat_inicio REAL,
    lng_inicio REAL,
    lat_fin REAL,
    lng_fin REAL,
    paquetes_llevados INTEGER NOT NULL DEFAULT 0,
    notas TEXT
  );`);
  db.run(`CREATE TABLE ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    ruta_id INTEGER,
    producto_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_aplicado REAL NOT NULL,
    costo_aplicado REAL NOT NULL,
    total REAL NOT NULL,
    utilidad REAL NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE',
    fecha_pago TEXT
  );`);
  db.run("INSERT INTO clientes (nombre, fecha_registro) VALUES ('Cliente antiguo', '2026-01-01');");
  db.run("INSERT INTO ventas (cliente_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago) VALUES (1, 'Producto antiguo', 2, 10000, 6000, 20000, 8000, '2026-01-02', '10:00', 'PAGADA');");
  db.run('PRAGMA user_version = 1;');
  return db;
}

const SQL = await initSqlJs({
  locateFile: (file) => fileURLToPath(new URL('../node_modules/sql.js/dist/' + file, import.meta.url)),
});

// a) Base completamente nueva.
const fresh = new SQL.Database();
initialize(fresh);
const freshConfig = fresh.exec(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'configuracion_app';",
)[0]?.values?.length ?? 0;
if (freshConfig !== 1) throw new Error('base nueva: configuracion_app no existe');
assertRequiredTables(fresh, 'base nueva');

// b) Base antigua de CAMELLO.
const legacy = createLegacyDatabase(SQL);
initialize(legacy);
assertRequiredTables(legacy, 'migración');
const client = legacy.exec('SELECT nombre FROM clientes WHERE id = 1;')[0]?.values?.[0]?.[0];
if (client !== 'Cliente antiguo') throw new Error('migración: se perdió un cliente existente');
const oldSale = legacy.exec('SELECT total FROM ventas WHERE id = 1;')[0]?.values?.[0]?.[0];
if (Number(oldSale) !== 20000) throw new Error('migración: se perdió una venta existente');
const routeColumns = new Set(
  (legacy.exec('PRAGMA table_info(rutas);')[0]?.values ?? []).map((row) => String(row[1])),
);
for (const required of ['nombre', 'fecha_planificada', 'hora_planificada']) {
  if (!routeColumns.has(required)) throw new Error(`migración: falta rutas.${required}`);
}
const version = Number(legacy.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0] ?? 0);
if (version !== DB_VERSION) throw new Error(`migración: user_version = ${version}`);

fresh.close();
legacy.close();

console.log('verify-db: OK (base nueva + migración v1→v2 + conservación de datos)');
