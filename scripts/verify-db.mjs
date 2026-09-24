import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DB_VERSION, SCHEMA_STATEMENTS as CURRENT_SCHEMA } from '../src/db/schema.ts';

const REQUIRED = [
  'clientes','mascotas','productos','rutas','ventas','fotos','seguimiento_clientes',
  'pagos','configuracion_app','borradores','categorias_gasto','gastos','gastos_recurrentes','modulos_migraciones',
];

const columnNames = (db, table) =>
  new Set((db.exec('PRAGMA table_info(' + table + ');')[0]?.values ?? []).map((row) => String(row[1])));

function addColumn(db, table, column, ddl) {
  if (!columnNames(db, table).has(column)) db.run('ALTER TABLE ' + table + ' ADD COLUMN ' + ddl + ';');
}

function health(db, label) {
  db.run('PRAGMA foreign_keys = ON;');
  const fk = db.exec('PRAGMA foreign_key_check;')[0]?.values ?? [];
  if (fk.length) throw new Error(label + ': foreign_key_check no vacío: ' + JSON.stringify(fk));
  const integrity = String(db.exec('PRAGMA integrity_check;')[0]?.values?.[0]?.[0] ?? '');
  if (integrity.toLowerCase() !== 'ok') throw new Error(label + ': integrity_check=' + integrity);
  const temp = db.exec("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND sql LIKE '%_migracion_%';")[0]?.values ?? [];
  if (temp.length) throw new Error(label + ': DDL temporal restante: ' + JSON.stringify(temp));
}

function migrate2(db) {
  addColumn(db,'rutas','nombre',"nombre TEXT NOT NULL DEFAULT ''");
  addColumn(db,'rutas','fecha_planificada','fecha_planificada TEXT');
  addColumn(db,'rutas','hora_planificada','hora_planificada TEXT');
}
function migrate3(db) {
  const p = columnNames(db,'productos');
  const v = columnNames(db,'ventas');
  const productosOk = p.has('precio') && p.has('costo') &&
    (db.exec('PRAGMA table_info(productos);')[0]?.values ?? []).filter(r => ['precio','costo'].includes(String(r[1]))).every(r => String(r[2]).toUpperCase() === 'INTEGER');
  const ventasOk = v.has('metodo_pago') && v.has('monto_pagado') && v.has('operacion_id') &&
    (db.exec('PRAGMA table_info(ventas);')[0]?.values ?? []).filter(r => ['precio_aplicado','costo_aplicado','total','utilidad'].includes(String(r[1]))).every(r => String(r[2]).toUpperCase() === 'INTEGER');
  if (productosOk && ventasOk) return;
  db.run('PRAGMA foreign_keys=OFF;');
  try {
    if (!productosOk) {
      db.run('ALTER TABLE productos RENAME TO productos_migracion_v3;');
      db.run("CREATE TABLE productos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,precio INTEGER NOT NULL,costo INTEGER NOT NULL,activo INTEGER NOT NULL DEFAULT 1);");
      db.run('INSERT INTO productos SELECT id,nombre,CAST(ROUND(precio) AS INTEGER),CAST(ROUND(costo) AS INTEGER),activo FROM productos_migracion_v3;');
      db.run('DROP TABLE productos_migracion_v3;');
    }
    if (!ventasOk) {
      db.run('DROP INDEX IF EXISTS idx_ventas_cliente;');
      db.run('DROP INDEX IF EXISTS idx_ventas_ruta;');
      db.run('DROP INDEX IF EXISTS idx_ventas_fecha;');
      db.run('ALTER TABLE ventas RENAME TO ventas_migracion_v3;');
      db.run("CREATE TABLE ventas (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER NOT NULL,ruta_id INTEGER,producto_nombre TEXT NOT NULL,cantidad INTEGER NOT NULL DEFAULT 1,precio_aplicado INTEGER NOT NULL,costo_aplicado INTEGER NOT NULL,total INTEGER NOT NULL,utilidad INTEGER NOT NULL,fecha TEXT NOT NULL,hora TEXT NOT NULL,estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE',fecha_pago TEXT,metodo_pago TEXT NOT NULL DEFAULT 'EFECTIVO',monto_pagado INTEGER NOT NULL DEFAULT 0,operacion_id TEXT UNIQUE,FOREIGN KEY(cliente_id) REFERENCES clientes(id),FOREIGN KEY(ruta_id) REFERENCES rutas(id),CHECK(monto_pagado>=0 AND monto_pagado<=total));");
      db.run("INSERT INTO ventas SELECT id,cliente_id,ruta_id,producto_nombre,cantidad,CAST(ROUND(precio_aplicado) AS INTEGER),CAST(ROUND(costo_aplicado) AS INTEGER),CAST(ROUND(total) AS INTEGER),CAST(ROUND(utilidad) AS INTEGER),fecha,hora,estado_pago,fecha_pago,COALESCE(metodo_pago,CASE WHEN estado_pago='PAGADA' THEN 'EFECTIVO' ELSE 'FIADO' END),MIN(MAX(CAST(ROUND(COALESCE(monto_pagado,0)) AS INTEGER),0),CAST(ROUND(total) AS INTEGER)),operacion_id FROM ventas_migracion_v3;");
      db.run('DROP TABLE ventas_migracion_v3;');
    }
  } finally { db.run('PRAGMA foreign_keys=ON;'); }
}
function migrate4(db) {
  addColumn(db,'clientes','ubicacion_precision_m','ubicacion_precision_m REAL');
  addColumn(db,'clientes','ubicacion_fuente','ubicacion_fuente TEXT');
  addColumn(db,'clientes','ubicacion_fecha','ubicacion_fecha TEXT');
  db.run(CURRENT_SCHEMA.find(s => s.includes('CREATE TABLE IF NOT EXISTS fotos')) ?? '');
}
function migrate5(db) {
  db.run(CURRENT_SCHEMA.find(s => s.includes('CREATE TABLE IF NOT EXISTS pagos')) ?? '');
}
function migrate6(db) { db.run(CURRENT_SCHEMA.find(s => s.includes('CREATE TABLE IF NOT EXISTS seguimiento_clientes')) ?? ''); }
function migrate7(db) { addColumn(db,'rutas','paquetes_sobrantes','paquetes_sobrantes INTEGER NOT NULL DEFAULT 0'); }
function migrate8(db) {
  const cols = columnNames(db,'rutas');
  if (!cols.has('fecha_planificada') && !cols.has('hora_planificada')) return;
  const snap = db.exec("SELECT id,nombre,tipo,estado,fecha,hora_inicio,hora_fin,lat_inicio,lng_inicio,lat_fin,lng_fin,paquetes_llevados,COALESCE(paquetes_sobrantes,0),notas FROM rutas ORDER BY id;")[0]?.values ?? [];
  db.run('PRAGMA foreign_keys=OFF;');
  try {
    db.run('DROP TABLE IF EXISTS rutas_reconstruccion_v8;');
    db.run(`CREATE TABLE rutas_reconstruccion_v8 (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL DEFAULT '',tipo TEXT NOT NULL,estado TEXT NOT NULL DEFAULT 'EN_CURSO',fecha TEXT NOT NULL,hora_inicio TEXT,hora_fin TEXT,lat_inicio REAL,lng_inicio REAL,lat_fin REAL,lng_fin REAL,paquetes_llevados INTEGER NOT NULL DEFAULT 0,paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,notas TEXT);`);
    db.run(`INSERT INTO rutas_reconstruccion_v8 SELECT id,nombre,tipo,CASE WHEN estado='PROGRAMADA' THEN 'CANCELADA' ELSE estado END,fecha,hora_inicio,hora_fin,lat_inicio,lng_inicio,lat_fin,lng_fin,paquetes_llevados,COALESCE(paquetes_sobrantes,0),notas FROM rutas;`);
    db.run('DROP TABLE rutas;');
    db.run(`CREATE TABLE rutas (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL DEFAULT '',tipo TEXT NOT NULL,estado TEXT NOT NULL DEFAULT 'EN_CURSO',fecha TEXT NOT NULL,hora_inicio TEXT,hora_fin TEXT,lat_inicio REAL,lng_inicio REAL,lat_fin REAL,lng_fin REAL,paquetes_llevados INTEGER NOT NULL DEFAULT 0,paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,notas TEXT);`);
    db.run('INSERT INTO rutas SELECT * FROM rutas_reconstruccion_v8;');
    db.run('DROP TABLE rutas_reconstruccion_v8;');
    if (Number(db.exec('SELECT COUNT(*) FROM rutas;')[0].values[0][0]) !== snap.length) throw new Error('v8: cambió el número de rutas.');
  } finally { db.run('PRAGMA foreign_keys=ON;'); }
}
function migrate9(db) {
  const refs = db.exec("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND sql LIKE '%_migracion_%';")[0]?.values ?? [];
  if (!refs.length) return;
  const refsMap = new Map();
  const rx=/\b([A-Za-z_][A-Za-z0-9]*_migracion_[A-Za-z0-9_]*)\b/g;
  for (const row of refs) {
    for (const match of String(row[3] ?? '').match(rx) ?? []) refsMap.set(match,match.split('_migracion_')[0]);
    if (String(row[1]).includes('_migracion_')) refsMap.set(String(row[1]),String(row[1]).split('_migracion_')[0]);
  }
  db.run('PRAGMA foreign_keys=OFF;');
  try {
    for (const row of refs.filter(r => String(r[0]) === 'table' && !String(r[1]).includes('_migracion_') && [...refsMap.keys()].some(t => String(r[3]).includes(t)))) {
      const name=String(row[1]), create=CURRENT_SCHEMA.find(s=>s.trimStart().startsWith('CREATE TABLE IF NOT EXISTS '+name+' '));
      if(!create) throw new Error('v9: no hay esquema canónico para '+name);
      const oldCols=[...columnNames(db,name)], temp=name+'_reparacion_v9';
      db.run('DROP TABLE IF EXISTS '+temp); db.run(create.replace('CREATE TABLE IF NOT EXISTS '+name,'CREATE TABLE '+temp));
      const common=oldCols.filter(col=>columnNames(db,temp).has(col)); if(!common.length) throw new Error('v9: sin columnas comunes para '+name);
      const list=common.map(col=>'"'+col.replace(/"/g,'""')+'"').join(',');
      db.run('INSERT INTO '+temp+'('+list+') SELECT '+list+' FROM '+name); db.run('DROP TABLE '+name); db.run(create); db.run('INSERT INTO '+name+'('+list+') SELECT '+list+' FROM '+temp); db.run('DROP TABLE '+temp);
    }
    for(const row of refs.filter(r=>String(r[0])==='table'&&String(r[1]).includes('_migracion_'))){
      const canonical=refsMap.get(String(row[1])); if(!canonical)continue;
      const exists=Number(db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='"+canonical.replace(/'/g,"''")+"'")[0].values[0][0]??0);
      if(exists){const count=Number(db.exec('SELECT COUNT(*) FROM '+row[1])[0].values[0][0]??0); if(count===0)db.run('DROP TABLE '+row[1]); else throw new Error('v9: tabla temporal con datos '+row[1]);}
    }
  } finally { db.run('PRAGMA foreign_keys=ON;'); }
  for(const statement of CURRENT_SCHEMA.filter(s=>/^CREATE INDEX IF NOT EXISTS/i.test(s.trim())))db.run(statement);
  health(db,'v9');
}
function migrate10(db){ db.run(CURRENT_SCHEMA.find(s=>s.includes('CREATE TABLE IF NOT EXISTS borradores')) ?? ''); }
function migrate11(db){ for(const s of CURRENT_SCHEMA.filter(s=>/^(CREATE TABLE IF NOT EXISTS (categorias_gasto|gastos|gastos_recurrentes)|CREATE INDEX IF NOT EXISTS idx_(gastos|recurrentes))/.test(s.trim())))db.run(s); for(const [n,t,na,o] of [['Arriendo','fijo','operativo',1],['Servicios','fijo','operativo',2],['Gas','variable','operativo',3],['Transporte/Gasolina','variable','operativo',4],['Empaques','variable','operativo',5],['Publicidad','variable','operativo',6],['Mantenimiento','variable','operativo',7],['Otros','variable','operativo',8],['Compra de materia prima','variable','compra_insumos',9],['Retiro del dueño','variable','retiro_dueno',10]])db.run('INSERT INTO categorias_gasto(nombre,tipo,naturaleza,orden) VALUES (?,?,?,?) ON CONFLICT(nombre) DO NOTHING',[n,t,na,o]); }
function migrate12(db){ for(const [t,c,ddl] of [['ventas','estado_registro',"estado_registro TEXT NOT NULL DEFAULT 'activa'"],['ventas','motivo_anulacion','motivo_anulacion TEXT'],['ventas','anulada_at','anulada_at TEXT'],['pagos','estado_registro',"estado_registro TEXT NOT NULL DEFAULT 'activa'"],['pagos','motivo_anulacion','motivo_anulacion TEXT'],['pagos','anulada_at','anulada_at TEXT'],['gastos','motivo_anulacion','motivo_anulacion TEXT'],['gastos','anulado_at','anulado_at TEXT']])addColumn(db,t,c,ddl); }
function migrate13(db){ db.run(CURRENT_SCHEMA.find(s=>s.includes('CREATE TABLE IF NOT EXISTS modulos_migraciones')) ?? ''); }
function migrate14(db){
  addColumn(db,'clientes','nombre_normalizado','nombre_normalizado TEXT NOT NULL DEFAULT ""');
  addColumn(db,'mascotas','nombre_normalizado','nombre_normalizado TEXT NOT NULL DEFAULT ""');
  db.run('CREATE INDEX IF NOT EXISTS idx_clientes_nombre_norm ON clientes(nombre_normalizado);');
  db.run('CREATE INDEX IF NOT EXISTS idx_mascotas_nombre_norm ON mascotas(nombre_normalizado);');
}


function applySchema(db){
  for(const statement of CURRENT_SCHEMA) db.run(statement);
}

function initialize(db){
  applySchema(db);
  const current=Number(db.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0]??0);
  if(current>DB_VERSION)throw new Error('Esquema '+current+' incompatible con '+DB_VERSION);
  const migrations=[[2,migrate2],[3,migrate3],[4,migrate4],[5,migrate5],[6,migrate6],[7,migrate7],[8,migrate8],[9,migrate9],[10,migrate10],[11,migrate11],[12,migrate12],[13,migrate13],[14,migrate14]];
  for(const [version,fn] of migrations)if(current<version)fn(db);
  db.run('PRAGMA user_version='+DB_VERSION+';');
  const rows=db.exec("SELECT name FROM sqlite_master WHERE type='table';")[0]?.values??[];
  const names=new Set(rows.map(r=>String(r[0]))); for(const t of REQUIRED)if(!names.has(t))throw new Error('Faltan tablas '+t);
  health(db,'initialize');
}

function fixture(SQL, name){ const db=new SQL.Database(); db.run(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8')); return db; }
function resumen(db){ const out={}; for(const t of ['clientes','mascotas','productos','rutas','ventas'])out[t]=Number(db.exec('SELECT COUNT(*) FROM '+t)[0]?.values?.[0]?.[0]??0); const r=db.exec('SELECT COALESCE(SUM(total),0),COALESCE(SUM(utilidad),0) FROM ventas;')[0]?.values?.[0]??[0,0]; out.total_ventas=Number(r[0]);out.total_utilidad=Number(r[1]);return out; }
function same(a,b,label){for(const k of Object.keys(a))if(a[k]!==b[k])throw new Error(label+': cambió '+k+' '+a[k]+'→'+b[k]);}
function userVersion(db){return Number(db.exec('PRAGMA user_version;')[0]?.values?.[0]?.[0]??0);}
function assertEq(actual,expected,label){if(actual!==expected)throw new Error(label+': '+actual+' != '+expected);}

function flujo(db,label){
  db.run('PRAGMA foreign_keys=ON;');
  db.run("INSERT INTO clientes(nombre,fecha_registro) VALUES ('"+label+" cliente','2026-09-24');");
  const cid=Number(db.exec('SELECT last_insert_rowid();')[0].values[0][0]);
  db.run("INSERT INTO rutas(nombre,tipo,estado,fecha,hora_inicio,paquetes_llevados,paquetes_sobrantes) VALUES ('Ruta "+label+"','Puerta a puerta','EN_CURSO','2026-09-24','11:00',3,0);");
  const rid=Number(db.exec('SELECT last_insert_rowid();')[0].values[0][0]);
  db.run("INSERT INTO ventas(cliente_id,ruta_id,producto_nombre,cantidad,precio_aplicado,costo_aplicado,total,utilidad,fecha,hora,estado_pago,metodo_pago,monto_pagado,operacion_id) VALUES (?,?,?,1,9000,4000,9000,5000,'2026-09-24','11:05','PENDIENTE','FIADO',0,?);",[cid,rid,'Producto '+label,label+'-venta']);
  const vid=Number(db.exec('SELECT last_insert_rowid();')[0].values[0][0]);
  db.run("INSERT INTO pagos(venta_id,cliente_id,monto,fecha,hora,metodo_pago,operacion_id) VALUES (?,?,4000,'2026-09-24','11:06','EFECTIVO',?);",[vid,cid,label+'-p1']);
  db.run("INSERT INTO pagos(venta_id,cliente_id,monto,fecha,hora,metodo_pago,operacion_id) VALUES (?,?,5000,'2026-09-24','11:07','TRANSFERENCIA_NEQUI',?);",[vid,cid,label+'-p2']);
  db.run("UPDATE ventas SET monto_pagado=9000,estado_pago='PAGADA',metodo_pago='TRANSFERENCIA_NEQUI',fecha_pago='2026-09-24' WHERE id=?;",[vid]);
  db.run("UPDATE rutas SET paquetes_sobrantes=paquetes_llevados-(SELECT COALESCE(SUM(cantidad),0) FROM ventas WHERE ruta_id=?) , estado='FINALIZADA', hora_fin='11:10' WHERE id=?;",[rid,rid]);
  const cuadre=Number(db.exec("SELECT paquetes_llevados-(SELECT COALESCE(SUM(cantidad),0) FROM ventas WHERE ruta_id=rutas.id)-paquetes_sobrantes FROM rutas WHERE id="+rid)[0].values[0][0]);
  assertEq(cuadre,0,label+' cuadre');
  assertEq(Number(db.exec('SELECT SUM(monto) FROM pagos WHERE venta_id='+vid)[0].values[0][0]),9000,label+' pagos');
}

function gastosTest(db){
  const cat=Number(db.exec("SELECT id FROM categorias_gasto WHERE nombre='Gas'")[0].values[0][0]);
  db.run("INSERT INTO gastos(fecha,monto,categoria_id,estado,periodo,created_at,updated_at) VALUES ('2026-09-24',15000,?,'pagado','2026-09',datetime('now'),datetime('now'));",[cat]);
  db.run("INSERT INTO gastos(fecha,monto,categoria_id,estado,periodo,created_at,updated_at) VALUES ('2026-09-24',9000,?,'pendiente','2026-09',datetime('now'),datetime('now'));",[cat]);
  assertEq(Number(db.exec("SELECT SUM(monto) FROM gastos WHERE periodo='2026-09' AND estado<>'anulado'")[0].values[0][0]),24000,'gastos total');
  assertEq(Number(db.exec("SELECT SUM(monto) FROM gastos WHERE estado='pendiente'")[0].values[0][0]),9000,'gastos pendientes');
}

function anulacionesTest(db){
  const cid=Number(db.exec('SELECT id FROM clientes LIMIT 1')[0].values[0][0]);
  db.run("INSERT INTO ventas(cliente_id,producto_nombre,cantidad,precio_aplicado,costo_aplicado,total,utilidad,fecha,hora,estado_pago,monto_pagado,operacion_id,estado_registro) VALUES (?, 'Anulable',1,10000,5000,10000,5000,'2026-09-24','12:00','PAGADA',10000,'u-test','activa');",[cid]);
  const id=Number(db.exec("SELECT id FROM ventas WHERE operacion_id='u-test'")[0].values[0][0]);
  const antes=Number(db.exec("SELECT COALESCE(SUM(total),0) FROM ventas WHERE estado_registro='activa'")[0].values[0][0]);
  db.run("UPDATE ventas SET estado_registro='anulada',motivo_anulacion='prueba',anulada_at='2026-09-24T12:01:00Z' WHERE id=?",[id]);
  const despues=Number(db.exec("SELECT COALESCE(SUM(total),0) FROM ventas WHERE estado_registro='activa'")[0].values[0][0]);
  assertEq(antes-despues,10000,'anulación métrica');
  const row=db.exec("SELECT estado_registro,motivo_anulacion,anulada_at FROM ventas WHERE id="+id)[0].values[0];
  if(row[0]!=='anulada'||!row[1]||!row[2])throw new Error('anulación sin auditoría');
}

const SQL=await initSqlJs({locateFile:file=>fileURLToPath(new URL('../node_modules/sql.js/dist/'+file,import.meta.url))});
const fresh=new SQL.Database(); initialize(fresh); flujo(fresh,'fresh'); gastosTest(fresh); anulacionesTest(fresh);
const v1=fixture(SQL,'schema-v1.sql'), before1=resumen(v1); initialize(v1); same(before1,resumen(v1),'v1'); if(userVersion(v1)!==DB_VERSION)throw new Error('v1 user_version');
const v2=fixture(SQL,'schema-v2.sql'), before2=resumen(v2); initialize(v2); same(before2,resumen(v2),'v2'); if(userVersion(v2)!==DB_VERSION)throw new Error('v2 user_version');
const v7=fixture(SQL,'schema-v7.sql'), before7=resumen(v7); initialize(v7); same(before7,resumen(v7),'v7'); flujo(v7,'v7');
const dañada=fixture(SQL,'schema-v8-damaged.sql');
const brokenDDL=dañada.exec("SELECT name,sql FROM sqlite_master WHERE sql LIKE '%_migracion_%'")[0]?.values??[];
if(!brokenDDL.some(r=>String(r[0])==='ventas'&&String(r[1]).includes('rutas_migracion_v8')))throw new Error('La fixture dañada no reproduce rutas_migracion_v8.');
const beforeD=resumen(dañada); initialize(dañada); same(beforeD,resumen(dañada),'damaged'); flujo(dañada,'damaged');
for(const db of [fresh,v1,v2,v7,dañada]){health(db,'final');db.close();}
console.log('verify-db: OK');
console.log(JSON.stringify({version:DB_VERSION,normalizacion:'PASÓ',base_nueva:'PASÓ',v1:'PASÓ',v2:'PASÓ',v7:'PASÓ',v8_dañada:'PASÓ',flujo_venta_ruta_pagos_cuadre:'PASÓ',gastos:'PASÓ',anulaciones:'PASÓ',foreign_key_check:'PASÓ',integrity_check:'PASÓ',ddl_migracion_temporal:'PASÓ'},null,2));
