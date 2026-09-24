// Esquema de la base de datos local de CAMELLO (SQLite).
// Principios: integridad de datos > respaldo > offline > seguridad > velocidad > simplicidad.
// Los precios y costos de una venta se guardan como snapshot histórico: NUNCA se recalculan
// si el producto cambia de precio después.

export const DB_NAME = 'camello';
export const DB_VERSION = 10

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

  `CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);`,
  `CREATE INDEX IF NOT EXISTS idx_mascotas_cliente ON mascotas(cliente_id);`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado);`,
  `CREATE INDEX IF NOT EXISTS idx_fotos_cliente ON fotos(cliente_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_cliente_fecha ON pagos(cliente_id, fecha);`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);`,
  `CREATE INDEX IF NOT EXISTS idx_borradores_updated ON borradores(updated_at);`,
];
