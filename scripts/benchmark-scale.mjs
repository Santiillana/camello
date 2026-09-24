import initSqlJs from 'sql.js';
import { performance } from 'node:perf_hooks';

const SQL = await initSqlJs({ locateFile: file => new URL('../node_modules/sql.js/dist/' + file, import.meta.url).pathname });
const db = new SQL.Database();
db.run('PRAGMA foreign_keys=ON;');
db.run('CREATE TABLE clientes(id INTEGER PRIMARY KEY,nombre_normalizado TEXT,estado TEXT);');
db.run('CREATE TABLE mascotas(id INTEGER PRIMARY KEY,cliente_id INTEGER,nombre_normalizado TEXT,estado TEXT);');
db.run('CREATE TABLE ventas(id INTEGER PRIMARY KEY,cliente_id INTEGER,fecha TEXT,total INTEGER,estado_registro TEXT);');
db.run('CREATE INDEX idx_clientes_nombre_norm ON clientes(nombre_normalizado);');
db.run('CREATE INDEX idx_mascotas_nombre_norm ON mascotas(nombre_normalizado);');
db.run('CREATE INDEX idx_ventas_cliente_fecha ON ventas(cliente_id,fecha);');
db.run('CREATE INDEX idx_ventas_fecha ON ventas(fecha);');

const insertClientes = db.prepare('INSERT INTO clientes(id,nombre_normalizado,estado) VALUES (?,?,?)');
for(let i=1;i<=36000;i++) insertClientes.run([i,'cliente '+String(i).padStart(5,'0'),'activo']);
insertClientes.free();

const insertMascotas = db.prepare('INSERT INTO mascotas(id,cliente_id,nombre_normalizado,estado) VALUES (?,?,?,?)');
for(let i=1;i<=60000;i++) { const cliente=(i%36000)+1; insertMascotas.run([i,cliente,'mascota '+i,'activo']); }
insertMascotas.free();

const insertVentas = db.prepare('INSERT INTO ventas(id,cliente_id,fecha,total,estado_registro) VALUES (?,?,?,?,?)');
for(let i=1;i<=150000;i++) { const cliente=(i%36000)+1; const day=String((i%28)+1).padStart(2,'0'); insertVentas.run([i,cliente,'2026-08-'+day,13000,'activa']); }
insertVentas.free();

function timed(name,fn,limitMs){ const start=performance.now(); const result=fn(); const ms=performance.now()-start; if(ms>limitMs) throw new Error(name+' tardó '+ms.toFixed(1)+' ms > '+limitMs); return {name,ms:Math.round(ms*10)/10,result}; }
const results=[];
results.push(timed('clientes_por_nombre',()=>db.exec("SELECT id FROM clientes WHERE nombre_normalizado GLOB 'cliente 35*' LIMIT 100"),300));
results.push(timed('mascotas_por_nombre',()=>db.exec("SELECT m.id FROM mascotas m JOIN clientes c ON c.id=m.cliente_id WHERE m.nombre_normalizado GLOB 'mascota 35*' LIMIT 100"),300));
results.push(timed('ventas_por_fecha',()=>db.exec("SELECT COALESCE(SUM(total),0) FROM ventas WHERE fecha BETWEEN '2026-08-01' AND '2026-08-31' AND estado_registro='activa'"),300));
results.push(timed('ventas_por_cliente',()=>db.exec("SELECT COALESCE(SUM(total),0) FROM ventas WHERE cliente_id=? AND estado_registro='activa'",[[12345]]),300));

const explain=db.exec("EXPLAIN QUERY PLAN SELECT id FROM clientes WHERE nombre_normalizado GLOB 'cliente 35*' LIMIT 100")[0]?.values ?? [];
const plan=JSON.stringify(explain);
if(/SCAN clientes(?! USING COVERING INDEX idx_clientes_nombre_norm)/i.test(plan) || !/SEARCH clientes USING COVERING INDEX idx_clientes_nombre_norm/i.test(plan)) {
  throw new Error('S1: EXPLAIN no usa búsqueda indexada de clientes: ' + plan);
}

console.log('benchmark-scale: PASÓ');
console.log(JSON.stringify({clientes:36000,mascotas:60000,ventas:150000,results,explain},null,2));
