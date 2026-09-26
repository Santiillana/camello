import { describe, expect, it } from 'vitest';
import {
  crearRespaldoPortable,
  validarRespaldoPortable,
  RESPALDO_PORTABLE_FORMAT,
} from '../src/utils/respaldoPortable.ts';

describe('respaldo portable CAMELLO', () => {
  it('crea un paquete versionado y lo valida con sus checksums', async () => {
    const json = await crearRespaldoPortable({
      appVersion: '1.0.0',
      database: 'camello',
      schemaVersion: 16,
      tables: [
        {
          name: 'clientes',
          columns: ['id', 'nombre'],
          rows: [[1, 'Cliente prueba']],
        },
      ],
      modules: {
        sorpresa: { version: 1, datos: { habitos: [] } },
      },
      exportedAt: '2026-09-26T00:00:00.000Z',
    });

    const resultado = await validarRespaldoPortable(json);
    expect(resultado.paquete.manifest.format).toBe(RESPALDO_PORTABLE_FORMAT);
    expect(resultado.paquete.manifest.format_version).toBe(1);
    expect(resultado.paquete.files.database.tables[0].rows[0][1]).toBe('Cliente prueba');
    expect(resultado.paquete.checksums.package).toHaveLength(64);
  });

  it('rechaza cambios en los datos después de exportar', async () => {
    const json = await crearRespaldoPortable({
      appVersion: '1.0.0',
      database: 'camello',
      schemaVersion: 16,
      tables: [{ name: 'clientes', columns: ['id'], rows: [[1]] }],
      modules: {},
      exportedAt: '2026-09-26T00:00:00.000Z',
    });
    const manipulado = json.replace('"id"', '"cliente_id"');
    await expect(validarRespaldoPortable(manipulado)).rejects.toThrow();
  });

  it('rechaza filas cuya cantidad de valores no coincide con las columnas', async () => {
    const json = await crearRespaldoPortable({
      appVersion: '1.0.0',
      database: 'camello',
      schemaVersion: 16,
      tables: [{ name: 'clientes', columns: ['id', 'nombre'], rows: [[1, 'OK']] }],
      modules: {},
      exportedAt: '2026-09-26T00:00:00.000Z',
    });
    const objeto = JSON.parse(json);
    objeto.files.database.tables[0].rows[0].push('extra');
    const reparadoSinChecksum = JSON.stringify(objeto);
    await expect(validarRespaldoPortable(reparadoSinChecksum)).rejects.toThrow();
  });
});
