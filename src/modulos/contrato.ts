import type { ComponentType, LazyExoticComponent } from 'react';

export type ModuloComponenteProps = { contexto: ContextoModulo };

export type ContextoModulo = {
  leer: <T = unknown>(operacion: 'clientes_activos' | 'ventas_periodo', parametros?: unknown[]) => Promise<T>;
  consultarPropio: <T = Record<string, unknown>>(sql: string, parametros?: unknown[]) => Promise<T[]>;
  ejecutarPropio: (sql: string, parametros?: unknown[]) => Promise<void>;
  migracion: (version: number, trabajo: () => Promise<void>) => Promise<void>;
};

export type ModuloContrato = {
  id: string;
  nombre: string;
  version: number;
  apiMinima: number;
  icono: string;
  ruta: string;
  Componente: LazyExoticComponent<ComponentType<ModuloComponenteProps>>;
  migraciones: Array<(contexto: ContextoModulo) => Promise<void>>;
  exportar: (contexto: ContextoModulo) => Promise<unknown>;
  importar: (contexto: ContextoModulo, datos: unknown) => Promise<void>;
  limpiar: (contexto: ContextoModulo) => Promise<void>;
};
