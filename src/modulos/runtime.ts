import type { ContextoModulo, ModuloContrato } from './contrato';

function esModuloContrato(valor: unknown): valor is ModuloContrato {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const registro = Object.fromEntries(Object.entries(valor));
  return typeof registro.id === 'string'
    && typeof registro.nombre === 'string'
    && typeof registro.version === 'number'
    && Array.isArray(registro.migraciones)
    && typeof registro.limpiar === 'function'
    && typeof registro.exportar === 'function'
    && typeof registro.importar === 'function';
}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor);
}

const entradas = import.meta.glob('./*/index.ts', { eager: true, import: 'default' });
const modulos = Object.values(entradas).filter(esModuloContrato);

export function listarModulos(): ModuloContrato[] {
  return modulos.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
}

export function obtenerModulo(id: string): ModuloContrato | undefined {
  return modulos.find((modulo) => modulo.id === id);
}

export function crearContexto(runtimeApi: {
  obtenerModuloHabilitado(id: string): Promise<boolean>;
  guardarModuloHabilitado(id: string, habilitado: boolean): Promise<void>;
  limpiarModuloDatosPrefijados(id: string): Promise<void>;
  crearContextoModulo(id: string): Promise<ContextoModulo>;
}) {
  return {
    listar: listarModulos,
    async habilitado(id: string) { return runtimeApi.obtenerModuloHabilitado(id); },
    async alternar(id: string, habilitado: boolean) {
      await runtimeApi.guardarModuloHabilitado(id, habilitado);
    },
    async limpiar(id: string) {
      const modulo = obtenerModulo(id);
      if (!modulo) throw new Error('Módulo no encontrado.');
      await modulo.limpiar(await runtimeApi.crearContextoModulo(id));
      await runtimeApi.limpiarModuloDatosPrefijados(id);
    },
    async limpiarTodo() {
      for (const modulo of modulos) {
        try {
          await modulo.limpiar(await runtimeApi.crearContextoModulo(modulo.id));
          await runtimeApi.limpiarModuloDatosPrefijados(modulo.id);
        } catch { /* La limpieza de almacenamiento auxiliar es best-effort y no debe bloquear el arranque del módulo. */ }
      }
    },
    async migrarTodo() {
      for (const modulo of modulos) {
        try {
          const enabled = await runtimeApi.obtenerModuloHabilitado(modulo.id);
          if (!enabled) continue;
          const contexto = await runtimeApi.crearContextoModulo(modulo.id);
          for (const migracion of modulo.migraciones) await migracion(contexto);
        } catch {
          await runtimeApi.guardarModuloHabilitado(modulo.id, false);
        }
      }
    },
    async exportarTodo() {
      const data: Record<string, unknown> = {};
      for (const modulo of modulos) {
        try {
          const enabled = await runtimeApi.obtenerModuloHabilitado(modulo.id);
          if (!enabled) {
            data[modulo.id] = { version: modulo.version, estado: 'desactivado' };
            continue;
          }
          const contexto = await runtimeApi.crearContextoModulo(modulo.id);
          data[modulo.id] = { version: modulo.version, datos: await modulo.exportar(contexto) };
        } catch {
          await runtimeApi.guardarModuloHabilitado(modulo.id, false);
          data[modulo.id] = { version: modulo.version, estado: 'desactivado_por_error' };
        }
      }
      return data;
    },
    async importarTodo(data: unknown) {
      if (!data || typeof data !== 'object') return;
      if (!esRegistro(data)) return;
      const record = data;
      for (const modulo of modulos) {
        const entry = record[modulo.id];
        if (!entry || typeof entry !== 'object') continue;
        try {
          const contexto = await runtimeApi.crearContextoModulo(modulo.id);
          if (!esRegistro(entry)) continue;
          await modulo.importar(contexto, entry.datos);
        } catch {
          await runtimeApi.guardarModuloHabilitado(modulo.id, false);
        }
      }
    },
  };
}

export async function inicializarModulos(runtimeApi: Parameters<typeof crearContexto>[0]): Promise<void> {
  await crearContexto(runtimeApi).migrarTodo();
}

