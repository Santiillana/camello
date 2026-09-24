import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DB_VERSION = 10;
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
  `CREATE TABLE IF NOT EXISTS borradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    clave TEXT NOT NULL,
    json TEXT NOT NULL,
    paso INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(tipo, clave)
  );`,
  'CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);',
  'CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);',
  'CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);',
  'CREATE INDEX IF NOT EXISTS idx_mascotas_cliente ON mascotas(cliente_id);',
  'CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado);',
  'CREATE INDEX IF NOT EXISTS idx_fotos_cliente ON fotos(cliente_id);',
  'CREATE INDEX IF NOT EXISTS idx_pagos_cliente_fecha ON pagos(cliente_id, fecha);',
  'CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);',
  'CREATE INDEX IF NOT EXISTS idx_borradores_updated ON borradores(updated_at);',
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

  const snapshot = db.exec(
    'SELECT id, nombre, tipo, estado, fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados, COALESCE(paquetes_sobrantes, 0), notas FROM rutas ORDER BY id;'
  )[0]?.values ?? [];

  db.run('PRAGMA foreign_keys = OFF;');
  try {
    db.run('DROP TABLE IF EXISTS rutas_reconstruccion_v8;');
    db.run('CREATE TABLE rutas_reconstruccion_v8 (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL DEFAULT '''', tipo TEXT NOT NULL, estado TEXT NOT NULL DEFAULT ''EN_CURSO'', fecha TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, lat_inicio REAL, lng_inicio REAL, lat_fin REAL, lng_fin REAL, paquetes_llevados INTEGER NOT NULL DEFAULT 0, paquetes_sobrantes INTEGER NOT NULL DEFAULT 0, notas TEXT);'.replace(/''/g, "'"));
    db.run('INSERT INTO rutas_reconstruccion_v8 (id, nombre, tipo, estado, fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados, paquetes_sobrantes, notas) SELECT id, nombre, tipo, CASE WHEN estado = ''PROGRAMADA'' THEN ''CANCELADA'' ELSE estado END, fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados, COALESCE(paquetes_sobrantes, 0), notas FROM rutas;'.replace(/''/g, "'"));
    db.run('DROP TABLE rutas;');
    db.run('CREATE TABLE rutas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL DEFAULT '''', tipo TEXT NOT NULL, estado TEXT NOT NULL DEFAULT ''EN_CURSO'', fecha TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, lat_inicio REAL, lng_inicio REAL, lat_fin REAL, lng_fin REAL, paquetes_llevados INTEGER NOT NULL DEFAULT 0, paquetes_sobrantes INTEGER NOT NULL DEFAULT 0, notas TEXT);'.replace(/''/g, "'"));
    db.run('INSERT INTO rutas (id, nombre, tipo, estado, fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados, paquetes_sobrantes, notas) SELECT id, nombre, tipo, estado, fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados, paquetes_sobrantes, notas FROM rutas_reconstruccion_v8;');
    db.run('DROP TABLE rutas_reconstruccion_v8;');

    const despues = Number(db.exec('SELECT COUNT(*) FROM rutas;')[0]?.values?.[0]?.[0] ?? 0);
    if (despues !== snapshot.length) throw new Error('v8: cambió el conteo de rutas.');
    const sobrantes = Number(db.exec('SELECT COALESCE(SUM(paquetes_sobrantes),0) FROM rutas;')[0]?.values?.[0]?.[0] ?? 0);
    const esperados = snapshot.reduce((sum, row) => sum + Number(row[12] ?? 0), 0);
    if (sobrantes !== esperados) throw new Error('v8: cambió el total de sobrantes.');
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }

  const fk = db.exec('PRAGMA foreign_key_check;')[0]?.values ?? [];
  if (fk.length) throw new Error('v8: foreign_key_check no está vacío.');
}

function migrateVersion9(db) {
  const referencias = db.exec("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND sql LIKE '%_migracion_%';")[0]?.values ?? [];
  if (!referencias.length) return;

  const objetos = referencias.map((row) => ({
    type: String(row[0] ?? ''),
    name: String(row[1] ?? ''),
    tbl_name: String(row[2] ?? ''),
    sql: String(row[3] ?? ''),
  }));
  const temporales = new Set();
  const extraer = /\b[A-Za-z_][A-Za-z0-9]*_migracion_[A-Za-z0-9_]*\b/g;
  for (const objeto of objetos) {
    for (const match of objeto.sql.match(extraer) ?? []) temporales.add(match);
    if (objeto.name.includes('_migracion_')) temporales.add(objeto.name);
  }
  const reemplazos = new Map([...temporales].map((temporal) => [temporal, temporal.split('_migracion_')[0]]));

  const objetosNoTabla = objetos.filter((objeto) => objeto.type !== 'table');
  for (const objeto of objetosNoTabla) {
    const nombre = '"' + objeto.name.replace(/"/g, '""') + '"';
    if (objeto.type === 'index') db.run('DROP INDEX IF EXISTS ' + nombre + ';');
    if (objeto.type === 'trigger') db.run('DROP TRIGGER IF EXISTS ' + nombre + ';');
    if (objeto.type === 'view') db.run('DROP VIEW IF EXISTS ' + nombre + ';');
  }

  const canonica = (nombre) => {
    const statement = SCHEMA_STATEMENTS.find((stmt) => stmt.trimStart().startsWith('CREATE TABLE IF NOT EXISTS ' + nombre + ' '));
    if (!statement) throw new Error('v9: no existe esquema canónico para ' + nombre);
    return statement;
  };

  const afectadas = objetos.filter((objeto) =>
    objeto.type === 'table' &&
    !objeto.name.includes('_migracion_') &&
    [...reemplazos.keys()].some((temporal) => objeto.sql.includes(temporal))
  );

  db.run('PRAGMA foreign_keys = OFF;');
  try {
    for (const objeto of afectadas) {
      const nombre = objeto.name;
      const oldCols = [...columnMap(db, nombre).keys()];
      const reparacion = nombre + '_reparacion_v9';
      const create = canonica(nombre);
      db.run('DROP TABLE IF EXISTS ' + reparacion + ';');
      db.run(create.replace('CREATE TABLE IF NOT EXISTS ' + nombre, 'CREATE TABLE ' + reparacion));
      const newCols = new Set([...columnMap(db, reparacion).keys()]);
      const comunes = oldCols.filter((col) => newCols.has(col));
      if (!comunes.length) throw new Error('v9: sin columnas comunes para ' + nombre);
      const lista = comunes.map((col) => '"' + col.replace(/"/g, '""') + '"').join(', ');
      db.run('INSERT INTO ' + reparacion + ' (' + lista + ') SELECT ' + lista + ' FROM ' + nombre + ';');
      db.run('DROP TABLE ' + nombre + ';');
      db.run(create);
      db.run('INSERT INTO ' + nombre + ' (' + lista + ') SELECT ' + lista + ' FROM ' + reparacion + ';');
      db.run('DROP TABLE ' + reparacion + ';');
    }

    for (const objeto of objetos.filter((item) => item.type === 'table' && item.name.includes('_migracion_'))) {
      const canonical = reemplazos.get(objeto.name);
      if (!canonical) continue;
      const existe = Number(db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='" + canonical.replace(/'/g, "''") + "';")[0]?.values?.[0]?.[0] ?? 0);
      if (!existe) continue;
      const filas = Number(db.exec('SELECT COUNT(*) FROM ' + objeto.name + ';')[0]?.values?.[0]?.[0] ?? 0);
      if (filas === 0) db.run('DROP TABLE ' + objeto.name + ';');
      else throw new Error('v9: quedó una tabla temporal con datos: ' + objeto.name);
    }
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }

  for (const statement of SCHEMA_STATEMENTS.filter((stmt) => /^CREATE INDEX IF NOT EXISTS/i.test(stmt.trim()))) db.run(statement);
  const normalizarSql = (sql) => {
    let resultado = sql;
    for (const [temporal, canonical] of reemplazos) resultado = resultado.split(temporal).join(canonical);
    return resultado;
  };
  for (const objeto of objetosNoTabla) {
    const sql = normalizarSql(objeto.sql);
    if (sql) db.run(sql);
  }

  const restantes = db.exec("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND sql LIKE '%_migracion_%';")[0]?.values ?? [];
  if (restantes.length) throw new Error('v9: quedaron referencias _migracion_: ' + JSON.stringify(restantes));
  const fk = db.exec('PRAGMA foreign_key_check;')[0]?.values ?? [];
  if (fk.length) throw new Error('v9: foreign_key_check no está vacío.');
  const integrity = String(db.exec('PRAGMA integrity_check;')[0]?.values?.[0]?.[0] ?? '');
  if (integrity.toLowerCase() !== 'ok') throw new Error('v9: integrity_check = ' + integrity);
}

function initialize(db) {
  applySchema(db);
  const currentVersion = Number(db.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0] ?? 0);
  if (currentVersion > DB_VERSION) throw new Error('Esquema ' + currentVersion + ' incompatible con ' + DB_VERSION);

  const migraciones = [
    [2, migrateVersion2],
    [3, migrateVersion3],
    [4, migrateVersion4],
    [5, migrateVersion5],
    [6, migrateVersion6],
    [7, migrateVersion7],
    [8, migrateVersion8],
  ];
  for (const [version, migracion] of migraciones) {
    if (currentVersion < version) migracion(db);
  }
  migrateVersion9(db);
  db.run('PRAGMA user_version = ' + DB_VERSION + ';');
  assertRequiredTables(db, 'inicialización');
  assertDbSaludable(db, 'inicialización');
}


