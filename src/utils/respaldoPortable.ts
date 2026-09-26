import { calcularChecksum } from './respaldo';

export const RESPALDO_PORTABLE_FORMAT = 'CAMELLO_PORTABLE_BACKUP';
export const RESPALDO_PORTABLE_VERSION = 1;
export const RESPALDO_PORTABLE_MAX_BYTES = 100 * 1024 * 1024;

export type RespaldoPortableTable = {
  name: string;
  columns: string[];
  rows: unknown[][];
};

export type RespaldoPortable = {
  manifest: {
    format: typeof RESPALDO_PORTABLE_FORMAT;
    format_version: number;
    app_version: string;
    database: string;
    schema_version: number;
    exported_at: string;
    table_count: number;
  };
  files: {
    database: {
      tables: RespaldoPortableTable[];
    };
    modules: Record<string, unknown>;
  };
  checksums: {
    database: string;
    modules: string;
    package: string;
  };
};

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor);
}

function normalizarTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function baseParaChecksum(paquete: Omit<RespaldoPortable, 'checksums'>): string {
  return JSON.stringify(paquete);
}

export async function crearRespaldoPortable(input: {
  appVersion: string;
  database: string;
  schemaVersion: number;
  tables: RespaldoPortableTable[];
  modules: Record<string, unknown>;
  exportedAt?: string;
}): Promise<string> {
  const manifest = {
    format: RESPALDO_PORTABLE_FORMAT,
    format_version: RESPALDO_PORTABLE_VERSION,
    app_version: input.appVersion,
    database: input.database,
    schema_version: input.schemaVersion,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    table_count: input.tables.length,
  } as const;

  const files = {
    database: {
      tables: input.tables,
    },
    modules: input.modules,
  };

  const database = await calcularChecksum(JSON.stringify(files.database));
  const modules = await calcularChecksum(JSON.stringify(files.modules));
  const sinChecksums = { manifest, files };
  const packageChecksum = await calcularChecksum(baseParaChecksum(sinChecksums));

  const paquete: RespaldoPortable = {
    manifest,
    files,
    checksums: {
      database,
      modules,
      package: packageChecksum,
    },
  };
  return JSON.stringify(paquete, null, 2);
}

export async function validarRespaldoPortable(
  jsonTexto: string,
): Promise<{ paquete: RespaldoPortable; bytes: number }> {
  const bytes = new TextEncoder().encode(jsonTexto).byteLength;
  if (bytes > RESPALDO_PORTABLE_MAX_BYTES) {
    throw new Error('El respaldo portable supera el límite de 100 MB.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonTexto);
  } catch {
    throw new Error('El respaldo portable no contiene JSON válido.');
  }

  if (!esRegistro(parsed)) throw new Error('El respaldo portable debe ser un objeto JSON.');
  if (!esRegistro(parsed.manifest) || !esRegistro(parsed.files) || !esRegistro(parsed.checksums)) {
    throw new Error('El respaldo portable está incompleto.');
  }

  const manifest = parsed.manifest;
  if (
    normalizarTexto(manifest.format) !== RESPALDO_PORTABLE_FORMAT
    || Number(manifest.format_version) !== RESPALDO_PORTABLE_VERSION
  ) {
    throw new Error('Formato de respaldo portable no compatible.');
  }

  const files = parsed.files;
  if (!esRegistro(files.database) || !Array.isArray(files.database.tables) || !esRegistro(files.modules)) {
    throw new Error('Los datos del respaldo portable están incompletos.');
  }

  const checksums = parsed.checksums;
  if (
    typeof checksums.database !== 'string'
    || typeof checksums.modules !== 'string'
    || typeof checksums.package !== 'string'
  ) {
    throw new Error('El respaldo portable no contiene checksums válidos.');
  }

  const tablas = files.database.tables;
  for (const table of tablas) {
    if (!esRegistro(table) || typeof table.name !== 'string' || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
      throw new Error('El respaldo portable contiene una tabla inválida.');
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) {
      throw new Error('El respaldo portable contiene un nombre de tabla inválido.');
    }
    if (!table.columns.every((column) => typeof column === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(column))) {
      throw new Error('El respaldo portable contiene columnas inválidas.');
    }
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length !== table.columns.length) {
        throw new Error('El respaldo portable contiene una fila incompatible con sus columnas.');
      }
    }
  }

  const sinChecksums = {
    manifest,
    files,
  };
  const databaseChecksum = await calcularChecksum(JSON.stringify(files.database));
  const modulesChecksum = await calcularChecksum(JSON.stringify(files.modules));
  const packageChecksum = await calcularChecksum(baseParaChecksum(sinChecksums));

  if (databaseChecksum !== checksums.database) throw new Error('Los datos SQLite del respaldo portable fueron alterados o están corruptos.');
  if (modulesChecksum !== checksums.modules) throw new Error('Los datos de módulos del respaldo portable fueron alterados o están corruptos.');
  if (packageChecksum !== checksums.package) throw new Error('El respaldo portable fue alterado o está corrupto.');

  const schemaVersion = Number(manifest.schema_version);
  const tableCount = Number(manifest.table_count);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) throw new Error('Versión de esquema inválida en el respaldo portable.');
  if (!Number.isInteger(tableCount) || tableCount !== tablas.length) throw new Error('El manifiesto del respaldo portable no coincide con sus tablas.');

  return { paquete: parsed as unknown as RespaldoPortable, bytes };
}
