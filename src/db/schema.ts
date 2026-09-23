// Esquema de la base de datos local de CAMELLO (SQLite).
// Principios: integridad de datos > respaldo > offline > seguridad > velocidad > simplicidad.
// Los precios y costos de una venta se guardan como snapshot histórico: NUNCA se recalculan
// si el producto cambia de precio después.

export const DB_NAME = 'camello.db';
export const DB_VERSION = 2;

export const MIGRACIONES = [{ version: 2, columns: [{ table: 'clientes', column: 'ultimo_contacto', sql: 'ALTER TABLE clientes ADD COLUMN ultimo_contacto TEXT;' }, { table: 'ventas', column: 'anulada', sql: 'ALTER TABLE ventas ADD COLUMN anulada INTEGER NOT NULL DEFAULT 0;' }] }];

export const SCHEMA_STATEMENTS: string[] = [
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
    estado TEXT NOT NULL DEFAULT 'activo',
    ultimo_contacto TEXT
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
    anulada INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (ruta_id) REFERENCES rutas(id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_cliente_fecha ON ventas(cliente_id, fecha DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_ruta_anulada ON ventas(ruta_id, anulada);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_anulada_fecha ON ventas(anulada, fecha);`,
  `CREATE INDEX IF NOT EXISTS idx_mascotas_cliente ON mascotas(cliente_id);`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado);`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_telefono1 ON clientes(telefono1);`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_telefono2 ON clientes(telefono2);`
];
