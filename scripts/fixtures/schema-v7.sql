PRAGMA foreign_keys = ON;

CREATE TABLE clientes (
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
);

CREATE TABLE mascotas (
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
);

CREATE TABLE productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  precio INTEGER NOT NULL,
  costo INTEGER NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE rutas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'EN_CURSO',
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
  paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
  notas TEXT
);

CREATE TABLE ventas (
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
);

CREATE TABLE fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  referencia TEXT,
  data_url TEXT NOT NULL,
  creado_at TEXT NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE pagos (
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
);

CREATE TABLE seguimiento_clientes (
  cliente_id INTEGER PRIMARY KEY,
  modo TEXT NOT NULL DEFAULT 'automatico',
  dias INTEGER,
  contactado_fecha TEXT,
  recordar_hasta TEXT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE configuracion_app (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT INTO clientes (id, nombre, telefono1, fecha_registro) VALUES
  (1, 'Cliente v7 1', '3001111111', '2026-07-01'),
  (2, 'Cliente v7 2', '3002222222', '2026-07-02');

INSERT INTO mascotas (id, cliente_id, nombre) VALUES
  (1, 1, 'Luna v7'),
  (2, 2, 'Max v7');

INSERT INTO productos (id, nombre, precio, costo, activo) VALUES
  (1, 'Producto v7 A', 13000, 7000, 1),
  (2, 'Producto v7 B', 18000, 10000, 1);

INSERT INTO rutas (id, nombre, tipo, estado, fecha, fecha_planificada, hora_planificada, paquetes_llevados, paquetes_sobrantes, notas)
VALUES (1, 'Ruta v7', 'Puerta a puerta', 'FINALIZADA', '2026-07-03', '2026-07-03', '08:00', 10, 4, 'Fixture v7');

INSERT INTO ventas (
  id, cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado,
  total, utilidad, fecha, hora, estado_pago, fecha_pago, metodo_pago, monto_pagado, operacion_id
) VALUES
  (1, 1, 1, 'Producto v7 A', 2, 13000, 7000, 26000, 12000, '2026-07-03', '09:00', 'PAGADA', '2026-07-03', 'EFECTIVO', 26000, 'fixture-v7-venta-1'),
  (2, 2, 1, 'Producto v7 B', 1, 18000, 10000, 18000, 8000, '2026-07-03', '10:00', 'PENDIENTE', NULL, 'FIADO', 0, 'fixture-v7-venta-2');

INSERT INTO pagos (id, venta_id, cliente_id, monto, fecha, hora, metodo_pago, operacion_id)
VALUES (1, 1, 1, 26000, '2026-07-03', '09:01', 'EFECTIVO', 'fixture-v7-pago-1');

PRAGMA user_version = 7;
