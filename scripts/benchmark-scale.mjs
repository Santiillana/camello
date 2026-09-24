import initSqlJs from 'sql.js';
import { performance } from 'node:perf_hooks';

const SQL = await initSqlJs({ locateFile: file => new URL('../node_modules/sql.js/dist/' + file, import.meta.url).pathname });
const db = new SQL.Database();
db.run('PRAGMA foreign_keys=ON;');
db.run('CREATE TABLE clientes(id INTEGER PRIMARY KEY,nombre_normalizado TEXT,estado TEXT);');
db.run('CREATE TABLE mascotas(id INTEGER PRIMARY KEY,cliente_id INTEGER,nombre_normalizado TEXT,estado TEXT);');
db.run('CREATE TABLE ventas(id INTEGER PRIMARY KEY,cliente_id INTEGER,fecha TEXT,total INTEGER,estado_registro TEXT);');
db.run('CREATE TABLE pagos(id INTEGER PRIMARY KEY,venta_id INTEGER,cliente_id INTEGER,fecha TEXT,monto INTEGER,estado_registro TEXT);');
db.run('CREATE TABLE gastos(id INTEGER PRIMARY KEY,fecha TEXT,periodo TEXT,monto INTEGER,categoria_id INTEGER,estado TEXT,archivado INTEGER);');
db.run('CREATE TABLE fotos(id INTEGER PRIMARY KEY,cliente_id INTEGER,categoria TEXT,referencia TEXT);');
db.run('CREATE INDEX idx_clientes_nombre_norm ON clientes(nombre_normalizado);');
db.run('CREATE INDEX idx_mascotas_nombre_norm ON mascotas(nombre_normalizado);');
db.run('CREATE INDEX idx_ventas_cliente_fecha ON ventas(cliente_id,fecha);');
db.run('CREATE INDEX idx_ventas_fecha ON ventas(fecha);');
db.run('CREATE INDEX idx_pagos_cliente_fecha ON pagos(cliente_id,fecha);');
db.run('CREATE INDEX idx_pagos_fecha ON pagos(fecha);');
db.run('CREATE INDEX idx_gastos_periodo ON gastos(periodo,estado,archivado);');
db.run('CREATE INDEX idx_gastos_categoria ON gastos(categoria_id,fecha);');
db.run('CREATE INDEX idx_fotos_cliente ON fotos(cliente_id);');

const insertClientes = db.prepare('INSERT INTO clientes(id,nombre_normalizado,estado) VALUES (?,?,?)');
for(let i=1;i<=36000;i++) insertClientes.run([i,'cliente '+String(i).padStart(5,'0'),'activo']);
insertClientes.free();

const insertMascotas = db.prepare('INSERT INTO mascotas(id,cliente_id,nombre_normalizado,estado) VALUES (?,?,?,?)');
for(let i=1;i<=60000;i++) { const cliente=(i%36000)+1; insertMascotas.run([i,cliente,'mascota '+i,'activo']); }
insertMascotas.free();

const insertVentas = db.prepare('INSERT INTO ventas(id,cliente_id,fecha,total,estado_registro) VALUES (?,?,?,?,?)');
for(let i=1;i<=150000;i++) { const cliente=(i%36000)+1; const day=String((i%28)+1).padStart(2,'0'); insertVentas.run([i,cliente,'2026-08-'+day,13000,'activa']); }
insertVentas.free();

const insertPagos = db.prepare('INSERT INTO pagos(id,venta_id,cliente_id,fecha,monto,estado_registro) VALUES (?,?,?,?,?,?)');
for(let i=1;i<=150000;i++) { const cliente=(i%36000)+1; const venta=(i%150000)+1; const day=String((i%28)+1).padStart(2,'0'); insertPagos.run([i,venta,cliente,'2026-08-'+day,13000,'activa']); }
insertPagos.free();

const insertGastos = db.prepare('INSERT INTO gastos(id,fecha,periodo,monto,categoria_id,estado,archivado) VALUES (?,?,?,?,?,?,?)');
for(let i=1;i<=40000;i++) { const month=(i%12)+1; const mes=String(month).padStart(2,'0'); const day=String((i%28)+1).padStart(2,'0'); insertGastos.run([i,'2026-'+mes+'-'+day,'2026-'+mes,7000,(i%12)+1,i%5===0?'pendiente':'pagado',0]); }
insertGastos.free();

const insertFotos = db.prepare('INSERT INTO fotos(id,cliente_id,categoria,referencia) VALUES (?,?,?,?)');
for(let i=1;i<=12000;i++) { insertFotos.run([i,(i%36000)+1,i%3===0?'casa':'cliente','foto-'+i+'.jpg']); }
insertFotos.free();

function timed(name,fn,limitMs){ const start=performance.now(); const result=fn(); const ms=performance.now()-start; if(ms>limitMs) throw new Error(name+' tardó '+ms.toFixed(1)+' ms > '+limitMs); return {name,ms:Math.round(ms*10)/10,result}; }
const results=[];
results.push(timed('clientes_por_nombre',()=>db.exec("SELECT id FROM clientes WHERE nombre_normalizado GLOB 'cliente 35*' LIMIT 100"),300));
results.push(timed('mascotas_por_nombre',()=>db.exec("SELECT m.id FROM mascotas m JOIN clientes c ON c.id=m.cliente_id WHERE m.nombre_normalizado GLOB 'mascota 35*' LIMIT 100"),300));
results.push(timed('ventas_por_fecha',()=>db.exec("SELECT COALESCE(SUM(total),0) FROM ventas WHERE fecha BETWEEN '2026-08-01' AND '2026-08-31' AND estado_registro='activa'"),300));
results.push(timed('ventas_por_cliente',()=>db.exec("SELECT COALESCE(SUM(total),0) FROM ventas WHERE cliente_id=? AND estado_registro='activa'",[[12345]]),300));
results.push(timed('pagos_por_cliente',()=>db.exec("SELECT COALESCE(SUM(monto),0) FROM pagos WHERE cliente_id=? AND estado_registro='activa'",[[12345]]),300));
results.push(timed('pagos_por_fecha',()=>db.exec("SELECT COALESCE(SUM(monto),0) FROM pagos WHERE fecha BETWEEN '2026-08-01' AND '2026-08-31' AND estado_registro='activa'"),300));
results.push(timed('gastos_por_periodo',()=>db.exec("SELECT COALESCE(SUM(monto),0) FROM gastos WHERE periodo='2026-08' AND archivado=0"),300));
results.push(timed('gastos_por_categoria',()=>db.exec("SELECT COALESCE(SUM(monto),0) FROM gastos WHERE categoria_id=? AND archivado=0",[[3]]),300));
results.push(timed('fotos_por_cliente',()=>db.exec("SELECT id,referencia FROM fotos WHERE cliente_id=? ORDER BY id DESC LIMIT 20",[[12345]]),300));

const explain=db.exec("EXPLAIN QUERY PLAN SELECT id FROM clientes WHERE nombre_normalizado GLOB 'cliente 35*' LIMIT 100")[0]?.values ?? [];
const plan=JSON.stringify(explain);
if(/SCAN clientes(?! USING COVERING INDEX idx_clientes_nombre_norm)/i.test(plan) || !/SEARCH clientes USING COVERING INDEX idx_clientes_nombre_norm/i.test(plan)) {
  throw new Error('S1: EXPLAIN no usa búsqueda indexada de clientes: ' + plan);
}

console.log('benchmark-scale: PASÓ');
console.log(JSON.stringify({clientes:36000,mascotas:60000,ventas:150000,pagos:150000,gastos:40000,fotos:12000,results,explain},null,2));
