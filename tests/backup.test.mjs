import { describe, expect, it } from 'vitest';
import { esBaseRespaldoCompatible } from '../src/db/database.ts';

describe('identidad de respaldos', () => {
  it('acepta los nombres de base válidos sin depender de la normalización posterior', () => {
    expect(esBaseRespaldoCompatible('camello', 'camello', 'camello')).toBe(true);
    expect(esBaseRespaldoCompatible('camello.db', 'camello', 'camello')).toBe(true);
    expect(esBaseRespaldoCompatible('camello', 'camello', 'camelloSQLite.db')).toBe(true);
  });

  it('rechaza un respaldo perteneciente a otra base antes de sustituir el nombre', () => {
    expect(esBaseRespaldoCompatible('otra_app', 'camello', 'camello')).toBe(false);
    expect(esBaseRespaldoCompatible(undefined, 'camello', 'camello')).toBe(false);
  });
});
