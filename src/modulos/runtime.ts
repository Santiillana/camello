import type { ContextoModulo, ModuloContrato } from './contrato';

const entradas = import.meta.glob('./*/index.ts', { eager: true, import: 'default' }) as Record<string, ModuloContrato>;
const modulos = Object.values(entradas);

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
        } catch {}
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
        const contexto = await runtimeApi.crearContextoModulo(modulo.id);
        data[modulo.id] = { version: modulo.version, datos: await modulo.exportar(contexto) };
      }
      return data;
    },
    async importarTodo(data: unknown) {
      if (!data || typeof data !== 'object') return;
      const record = data as Record<string, unknown>;
      for (const modulo of modulos) {
        const entry = record[modulo.id];
        if (!entry || typeof entry !== 'object') continue;
        try {
          const contexto = await runtimeApi.crearContextoModulo(modulo.id);
          await modulo.importar(contexto, (entry as Record<string, unknown>).datos);
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

