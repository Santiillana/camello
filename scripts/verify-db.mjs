import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB_VERSION = 8;
const REQUIRED_TABLES = [
  'clientes',
  'mascotas',
  'productos',
  'rutas',
  'ventas',
  'configuracion_app',
  'fotos',
  'pagos',
  'seguimiento_clientes',
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
    estado TEXT NOT NULL DEFAULT 'EN_CURSO',
    fecha TEXT NOT NULL,
    hora_inicio TEXT,
    hora_fin TEXT,
    lat_inicio REAL,
    lng_inicio REAL,
    lat_fin REAL,
    lng_fin REAL,
    paquetes_llevados INTEGER NOT NULL DEFAULT 0,
    paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS seguimiento_clientes (
    cliente_id INTEGER PRIMARY KEY,
    modo TEXT NOT NULL DEFAULT 'automatico',
    dias INTEGER,
    contactado_fecha TEXT,
    recordar_hasta TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );`,
  `CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    monto INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    metodo_pago TEXT NOT NULL,
    operacion_id TEXT UNIQUE,
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    CHECK (monto > 0)
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
  'CREATE INDEX IF NOT EXISTS idx_pagos_cliente_fecha ON pagos(cliente_id, fecha);',
  'CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);',
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

function migrateVersion5(db) {
  db.run(`CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    monto INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    metodo_pago TEXT NOT NULL,
    operacion_id TEXT UNIQUE,
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    CHECK (monto > 0)
  );`);
  db.run('CREATE INDEX IF NOT EXISTS idx_pagos_cliente_fecha ON pagos(cliente_id, fecha);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);');

  const count = Number(db.exec('SELECT COUNT(*) FROM pagos;')[0]?.values?.[0]?.[0] ?? 0);
  if (count === 0) {
    const pagadas = db.exec(
      "SELECT id, cliente_id, total, fecha, hora, COALESCE(metodo_pago,'EFECTIVO') FROM ventas WHERE estado_pago = 'PAGADA' AND COALESCE(monto_pagado,total) > 0;",
    )[0]?.values ?? [];
    for (const row of pagadas) {
      db.run(
        'INSERT INTO pagos (venta_id, cliente_id, monto, fecha, hora, metodo_pago) VALUES (?, ?, ?, ?, ?, ?);',
        [Number(row[0]), Number(row[1]), Number(row[2]), String(row[3]), String(row[4]), String(row[5])],
      );
    }
  }
}

function migrateVersion6(db) {
  db.run(`CREATE TABLE IF NOT EXISTS seguimiento_clientes (
    cliente_id INTEGER PRIMARY KEY,
    modo TEXT NOT NULL DEFAULT 'automatico',
    dias INTEGER,
    contactado_fecha TEXT,
    recordar_hasta TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );`);
}

function migrateVersion7(db) {
  const rows = db.exec('PRAGMA table_info(rutas);')[0]?.values ?? [];
  const columns = new Set(rows.map((row) => String(row[1])));
  if (!columns.has('paquetes_sobrantes')) db.run('ALTER TABLE rutas ADD COLUMN paquetes_sobrantes INTEGER NOT NULL DEFAULT 0;');
}

function migrateVersion8(db) {
  const rows = db.exec('PRAGMA table_info(rutas);')[0]?.values ?? [];
  const columns = new Set(rows.map((row) => String(row[1])));
  if (!columns.has('fecha_planificada') && !columns.has('hora_planificada')) return;
  db.run('PRAGMA foreign_keys = OFF;');
  db.run('BEGIN TRANSACTION;');
  try {
    db.run('ALTER TABLE rutas RENAME TO rutas_migracion_v8;');
    db.run(`CREATE TABLE rutas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'EN_CURSO',
      fecha TEXT NOT NULL,
      hora_inicio TEXT,
      hora_fin TEXT,
      lat_inicio REAL,
      lng_inicio REAL,
      lat_fin REAL,
      lng_fin REAL,
      paquetes_llevados INTEGER NOT NULL DEFAULT 0,
      paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
      notas TEXT
    );`);
    db.run(`INSERT INTO rutas (
      id, nombre, tipo, estado, fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio,
      lat_fin, lng_fin, paquetes_llevados, paquetes_sobrantes, notas
    )
    SELECT id, nombre, tipo,
      CASE WHEN estado = 'PROGRAMADA' THEN 'CANCELADA' ELSE estado END,
      fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin, lng_fin,
      paquetes_llevados, COALESCE(paquetes_sobrantes,0), notas
    FROM rutas_migracion_v8;`);
    db.run('DROP TABLE rutas_migracion_v8;');
    db.run('COMMIT;');
  } catch (error) {
    try { db.run('ROLLBACK;'); } catch {}
    throw error;
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }
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
  migrateVersion5(db);
  migrateVersion6(db);
  migrateVersion7(db);
  migrateVersion8(db);
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

// c) Cobro parcial FIFO y saldo restante.
fresh.run("INSERT INTO clientes (id, nombre, fecha_registro) VALUES (2, 'Cliente cartera', '2026-09-24');");
fresh.run("INSERT INTO ventas (id, cliente_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, monto_pagado, metodo_pago, operacion_id) VALUES (2, 2, 'Deuda 1', 1, 10000, 5000, 10000, 5000, '2026-09-20', '09:00', 'PENDIENTE', 0, 'FIADO', 'venta-deuda-1');");
fresh.run("INSERT INTO ventas (id, cliente_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, monto_pagado, metodo_pago, operacion_id) VALUES (3, 2, 'Deuda 2', 1, 8000, 4000, 8000, 4000, '2026-09-21', '10:00', 'PENDIENTE', 0, 'FIADO', 'venta-deuda-2');");
fresh.run("INSERT INTO pagos (venta_id, cliente_id, monto, fecha, hora, metodo_pago, operacion_id) VALUES (2, 2, 7000, '2026-09-24', '10:30', 'EFECTIVO', 'cobro-1-2');");
fresh.run("UPDATE ventas SET monto_pagado = 7000, metodo_pago = 'EFECTIVO' WHERE id = 2;");
fresh.run("INSERT INTO pagos (venta_id, cliente_id, monto, fecha, hora, metodo_pago, operacion_id) VALUES (3, 2, 5000, '2026-09-24', '10:30', 'EFECTIVO', 'cobro-1-3');");
fresh.run("UPDATE ventas SET monto_pagado = 5000, metodo_pago = 'EFECTIVO' WHERE id = 3;");
const saldoCartera = Number(fresh.exec("SELECT SUM(total - monto_pagado) FROM ventas WHERE cliente_id = 2;")[0].values[0][0]);
if (saldoCartera !== 6000) throw new Error('cartera: el saldo después de abonos no es 6000');
const cobradoHoy = Number(fresh.exec("SELECT SUM(monto) FROM pagos WHERE cliente_id = 2 AND fecha = '2026-09-24';")[0].values[0][0]);
if (cobradoHoy !== 12000) throw new Error('cartera: cobrado hoy no es 12000');

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
