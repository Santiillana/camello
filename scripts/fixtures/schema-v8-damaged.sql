PRAGMA foreign_keys = ON;

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  fecha_registro TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo'
);

CREATE TABLE mascotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo'
);

CREATE TABLE productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL,
  costo REAL NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE rutas (
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
  paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
  notas TEXT
);

CREATE TABLE ventas (
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
  metodo_pago TEXT NOT NULL DEFAULT 'FIADO',
  monto_pagado INTEGER NOT NULL DEFAULT 0,
  operacion_id TEXT UNIQUE,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (ruta_id) REFERENCES rutas(id)
);

INSERT INTO clientes (id, nombre, fecha_registro) VALUES (1, 'Cliente dañada v8', '2026-08-01');
INSERT INTO productos (id, nombre, precio, costo, activo) VALUES (1, 'Producto dañada v8', 10000, 5000, 1);
INSERT INTO rutas (id, nombre, tipo, estado, fecha, fecha_planificada, hora_planificada, paquetes_llevados, paquetes_sobrantes)
VALUES (1, 'Ruta dañada v8', 'Puerta a puerta', 'FINALIZADA', '2026-08-02', '2026-08-02', '08:00', 5, 4);
INSERT INTO ventas (
  id, cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado,
  total, utilidad, fecha, hora, estado_pago, metodo_pago, monto_pagado, operacion_id
) VALUES
  (1, 1, 1, 'Producto dañada v8', 1, 10000, 5000, 10000, 5000, '2026-08-02', '09:00', 'PENDIENTE', 'FIADO', 0, 'fixture-dañada-v8');

PRAGMA foreign_keys = OFF;
ALTER TABLE rutas RENAME TO rutas_migracion_v8;
CREATE TABLE rutas (
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
);
INSERT INTO rutas (id, nombre, tipo, estado, fecha, paquetes_llevados, paquetes_sobrantes)
SELECT id, nombre, tipo, CASE WHEN estado = 'PROGRAMADA' THEN 'CANCELADA' ELSE estado END, fecha, paquetes_llevados, paquetes_sobrantes
FROM rutas_migracion_v8;
DROP TABLE rutas_migracion_v8;
PRAGMA user_version = 8;
