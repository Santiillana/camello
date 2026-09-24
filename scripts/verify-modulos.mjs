import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve('src/modulos/sorpresa');
const files=readdirSync(root).filter(name=>/\.(ts|tsx)$/.test(name));
if(!files.length)throw new Error('verify:modulos: falta el módulo sorpresa.');
for(const file of files){
  const text=readFileSync(resolve(root,file),'utf8');
  if(/from\s+['"](?:\.\.?\/){2,}/.test(text))throw new Error('verify:modulos: import fuera de la API en '+file);
  if(/(?:fetch|XMLHttpRequest|sendBeacon|innerHTML|dangerouslySetInnerHTML)/.test(text))throw new Error('verify:modulos: API prohibida en '+file);
}
const index=readFileSync(resolve(root,'index.ts'),'utf8');
for(const required of ['id:','nombre:','version:','apiMinima:','icono:','ruta:','Componente','migraciones:','exportar:','importar:','limpiar:']){
  if(!index.includes(required))throw new Error('verify:modulos: falta '+required);
}
const dbSource = readFileSync(resolve('src/db/database.ts'),'utf8');
if (/importarRespaldo[\s\S]{0,5000}crearContexto\([^)]*\)[\s\S]{0,2000}importarTodo/.test(dbSource)) {
  throw new Error('verify:modulos: importarRespaldo vuelve a inyectar datos y puede duplicar filas.');
}
const runtimeSource = readFileSync(resolve('src/modulos/runtime.ts'),'utf8');
if (!runtimeSource.includes("estado: 'desactivado_por_error'")) {
  throw new Error('verify:modulos: falta aislamiento de fallos durante exportación.');
}
console.log('verify:modulos: PASÓ — aislamiento de imports, red, HTML inseguro, contrato y restauración sin duplicados.');
