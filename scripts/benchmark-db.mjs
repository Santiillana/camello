import initSqlJs from 'sql.js';
import { performance } from 'node:perf_hooks';

const SQL = await initSqlJs();
const db = new SQL.Database();
db.run('PRAGMA foreign_keys = ON;');

db.run(`CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  fecha_registro TEXT NOT NULL,
  lat REAL,
  lng REAL,
  estado TEXT NOT NULL DEFAULT 'activo'
);`);
db.run(`CREATE TABLE mascotas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo',
  FOREIGN KEY(cliente_id) REFERENCES clientes(id)
);`);
db.run(`CREATE TABLE rutas (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  paquetes_llevados INTEGER NOT NULL,
  paquetes_sobrantes INTEGER NOT NULL DEFAULT 0
);`);
db.run(`CREATE TABLE ventas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  ruta_id INTEGER,
  producto_nombre TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_aplicado INTEGER NOT NULL,
  costo_aplicado INTEGER NOT NULL,
  total INTEGER NOT NULL,
  utilidad INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  estado_pago TEXT NOT NULL,
  monto_pagado INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(cliente_id) REFERENCES clientes(id),
  FOREIGN KEY(ruta_id) REFERENCES rutas(id)
);`);

db.run('CREATE INDEX idx_ventas_cliente ON ventas(cliente_id);');
db.run('CREATE INDEX idx_ventas_fecha ON ventas(fecha);');
db.run('CREATE INDEX idx_ventas_ruta ON ventas(ruta_id);');
db.run('CREATE INDEX idx_mascotas_cliente ON mascotas(cliente_id);');
db.run('CREATE INDEX idx_clientes_estado ON clientes(estado);');

db.run('BEGIN TRANSACTION;');

const insertCliente = db.prepare('INSERT INTO clientes (id,nombre,fecha_registro,lat,lng) VALUES (?,?,?,?,?);');
for (let i = 1; i <= 2000; i++) {
  insertCliente.run([
    i,
    'Cliente ' + i,
    '2026-09-' + String(((i - 1) % 28) + 1).padStart(2, '0'),
    i % 3 === 0 ? 4.14 + (i % 100) / 10000 : null,
    i % 3 === 0 ? -73.62 - (i % 100) / 10000 : null,
  ]);
}
insertCliente.free();

const insertMascota = db.prepare('INSERT INTO mascotas (id,cliente_id,nombre) VALUES (?,?,?);');
for (let i = 1; i <= 5000; i++) {
  insertMascota.run([i, ((i - 1) % 2000) + 1, 'Mascota ' + i]);
}
insertMascota.free();

const insertRuta = db.prepare('INSERT INTO rutas (id,nombre,tipo,estado,fecha,hora_inicio,hora_fin,paquetes_llevados) VALUES (?,?,?,?,?,?,?,?);');
for (let i = 1; i <= 50; i++) {
  insertRuta.run([
    i,
    'Ruta ' + i,
    i % 2 === 0 ? 'Puerta a puerta' : 'Venta local móvil',
    'FINALIZADA',
    '2026-09-' + String(((i - 1) % 20) + 1).padStart(2, '0'),
    '09:00',
    '13:00',
    20,
  ]);
}
insertRuta.free();

const insertVenta = db.prepare('INSERT INTO ventas (id,cliente_id,ruta_id,producto_nombre,cantidad,precio_aplicado,costo_aplicado,total,utilidad,fecha,hora,estado_pago,monto_pagado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);');
for (let i = 1; i <= 20000; i++) {
  const cliente = ((i - 1) % 2000) + 1;
  const ruta = ((i - 1) % 50) + 1;
  const cantidad = (i % 3) + 1;
  const total = 13000 * cantidad;
  const pagado = i % 5 === 0 ? 0 : total;
  insertVenta.run([
    i,
    cliente,
    ruta,
    'Galletas',
    cantidad,
    13000,
    7000,
    total,
    total - (7000 * cantidad),
    '2026-09-' + String(((i - 1) % 20) + 1).padStart(2, '0'),
    String(9 + (i % 8)).padStart(2, '0') + ':00',
    pagado === total ? 'PAGADA' : 'PENDIENTE',
    pagado,
  ]);
}
insertVenta.free();

db.run('COMMIT;');

const pruebas = [
  ['inicio',
    `SELECT
       COALESCE(SUM(total),0) AS ventas,
       COALESCE(SUM(monto_pagado),0) AS cobrado,
       COALESCE(SUM(total-monto_pagado),0) AS pendiente,
       COALESCE(SUM(costo_aplicado*cantidad),0) AS costos,
       COALESCE(SUM(utilidad),0) AS utilidad,
       COUNT(*) AS numero_ventas
     FROM ventas
     WHERE fecha BETWEEN '2026-09-01' AND '2026-09-20';`],
  ['clientes',
    `SELECT
       c.id,
       c.nombre,
       (SELECT COUNT(*) FROM mascotas m WHERE m.cliente_id=c.id AND m.estado='activo') AS mascotas,
       (SELECT COALESCE(SUM(v.total),0) FROM ventas v WHERE v.cliente_id=c.id) AS total_comprado,
       (SELECT MAX(v.fecha) FROM ventas v WHERE v.cliente_id=c.id) AS ultima_compra,
       (SELECT COALESCE(SUM(v.total-v.monto_pagado),0) FROM ventas v WHERE v.cliente_id=c.id) AS pendiente
     FROM clientes c
     WHERE c.estado='activo'
     ORDER BY c.nombre
     LIMIT 2000;`],
  ['cartera',
    `SELECT
       c.id,
       c.nombre,
       COALESCE(SUM(v.total-v.monto_pagado),0) AS saldo
     FROM clientes c
     JOIN ventas v ON v.cliente_id=c.id AND v.total>v.monto_pagado
     WHERE c.estado='activo'
     GROUP BY c.id,c.nombre
     ORDER BY saldo DESC;`],
  ['rutas',
    `SELECT
       r.id,
       r.nombre,
       r.paquetes_llevados,
       r.paquetes_sobrantes,
       COALESCE(x.vendidos,0) AS vendidos,
       COALESCE(x.total_vendido,0) AS total_vendido,
       COALESCE(x.cobrado,0) AS cobrado
     FROM rutas r
     LEFT JOIN (
       SELECT ruta_id,
              SUM(cantidad) AS vendidos,
              SUM(total) AS total_vendido,
              SUM(monto_pagado) AS cobrado
       FROM ventas
       GROUP BY ruta_id
     ) x ON x.ruta_id=r.id
     ORDER BY r.id DESC;`],
  ['informes',
    `SELECT
       fecha,
       COUNT(*) AS numero_ventas,
       SUM(total) AS ventas,
       SUM(monto_pagado) AS cobrado,
       SUM(total-monto_pagado) AS pendiente,
       SUM(utilidad) AS utilidad
     FROM ventas
     WHERE fecha BETWEEN '2026-09-01' AND '2026-09-20'
     GROUP BY fecha
     ORDER BY fecha;`],
  ['mapa',
    `SELECT
       c.id,
       c.nombre,
       c.lat,
       c.lng
     FROM clientes c
     WHERE c.estado='activo' AND c.lat IS NOT NULL AND c.lng IS NOT NULL
     ORDER BY c.nombre
     LIMIT 2000;`],
];

const resultados = [];
for (const [nombre, sql] of pruebas) {
  const inicio = performance.now();
  db.exec(sql);
  const ms = performance.now() - inicio;
  resultados.push({ pantalla: nombre, ms: Number(ms.toFixed(2)) });
  if (ms >= 1000) throw new Error(nombre + ' excedió 1 s: ' + ms.toFixed(2) + ' ms');
}

console.log(JSON.stringify({
  seed: { clientes: 2000, mascotas: 5000, ventas: 20000 },
  resultados,
  estado: 'PASÓ',
}, null, 2));

db.close();
