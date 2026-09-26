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
  (1, 'Cliente antiguo 1', '2026-01-01'),
  (2, 'Cliente antiguo 2', '2026-01-02');

INSERT INTO mascotas (id, cliente_id, nombre) VALUES
  (1, 1, 'Luna'),
  (2, 1, 'Max'),
  (3, 2, 'Nala');

INSERT INTO productos (id, nombre, precio, costo, activo) VALUES
  (1, 'Producto antiguo A', 10000, 6000, 1),
  (2, 'Producto antiguo B', 15000, 9000, 1);

INSERT INTO rutas (id, tipo, estado, fecha, hora_inicio, hora_fin, paquetes_llevados, notas) VALUES
  (1, 'Puerta a puerta', 'FINALIZADA', '2026-01-03', '09:00', '13:00', 20, 'Ruta antigua 1'),
  (2, 'Vereda', 'FINALIZADA', '2026-01-04', '10:00', '14:00', 10, 'Ruta antigua 2');

INSERT INTO ventas (
  id, cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado,
  total, utilidad, fecha, hora, estado_pago
) VALUES
  (1, 1, 1, 'Producto antiguo A', 2, 10000, 6000, 20000, 8000, '2026-01-03', '10:00', 'PAGADA'),
  (2, 1, 1, 'Producto antiguo B', 1, 15000, 9000, 15000, 6000, '2026-01-03', '11:00', 'PENDIENTE'),
  (3, 2, 2, 'Producto antiguo A', 2, 10000, 6000, 20000, 8000, '2026-01-04', '12:00', 'PAGADA');

PRAGMA user_version = 1;
