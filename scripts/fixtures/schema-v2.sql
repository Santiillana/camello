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
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (ruta_id) REFERENCES rutas(id)
);

INSERT INTO clientes (id, nombre, fecha_registro) VALUES
  (1, 'Cliente v2 1', '2026-02-01'),
  (2, 'Cliente v2 2', '2026-02-02');

INSERT INTO mascotas (id, cliente_id, nombre) VALUES
  (1, 1, 'Milo'),
  (2, 2, 'Coco');

INSERT INTO productos (id, nombre, precio, costo, activo) VALUES
  (1, 'Producto v2 A', 12000, 7000, 1),
  (2, 'Producto v2 B', 18000, 11000, 1);

INSERT INTO rutas (id, nombre, tipo, estado, fecha, fecha_planificada, hora_planificada, hora_inicio, hora_fin, paquetes_llevados, notas) VALUES
  (1, 'Ruta v2 1', 'Puerta a puerta', 'FINALIZADA', '2026-02-03', '2026-02-03', '08:00', '08:30', '12:30', 15, 'Ruta v2 antigua');

INSERT INTO ventas (
  id, cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado,
  total, utilidad, fecha, hora, estado_pago
) VALUES
  (1, 1, 1, 'Producto v2 A', 2, 12000, 7000, 24000, 10000, '2026-02-03', '09:15', 'PAGADA'),
  (2, 2, 1, 'Producto v2 B', 1, 18000, 11000, 18000, 7000, '2026-02-03', '10:15', 'PENDIENTE');

PRAGMA user_version = 2;
