import { lazy } from 'react';
import type { ModuloContrato } from '../contrato';

const Componente = lazy(() => import('./Sorpresa'));

const modulo: ModuloContrato = {
  id: 'sorpresa',
  nombre: 'Sorpresa',
  version: 1,
  apiMinima: 1,
  icono: 'paw',
  ruta: '/sorpresa',
  Componente,
  migraciones: [
    async (contexto) => contexto.migracion(1, async () => {
      await contexto.ejecutarPropio(`CREATE TABLE IF NOT EXISTS mod_sorpresa_habitos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        titulo TEXT NOT NULL,
        hecho INTEGER NOT NULL DEFAULT 0,
        nota TEXT
      );`);
    }),
  ],
  exportar: async (contexto) => ({
    habitos: await contexto.consultarPropio(
      'SELECT id, fecha, titulo, hecho, nota FROM mod_sorpresa_habitos ORDER BY fecha DESC, id DESC;',
    ),
  }),
  importar: async (contexto, datos) => {
    if (!datos || typeof datos !== 'object') return;
    const habitos = (datos as { habitos?: unknown }).habitos;
    if (!Array.isArray(habitos)) return;
    for (const item of habitos) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (typeof row.fecha !== 'string' || typeof row.titulo !== 'string') continue;
      await contexto.ejecutarPropio(
        'INSERT INTO mod_sorpresa_habitos (fecha,titulo,hecho,nota) VALUES (?,?,?,?);',
        [row.fecha.slice(0,10), row.titulo.slice(0,140), row.hecho ? 1 : 0, typeof row.nota === 'string' ? row.nota.slice(0,300) : null],
      );
    }
  },
  limpiar: async (contexto) => {
    await contexto.ejecutarPropio('DELETE FROM mod_sorpresa_habitos;');
  },
};

export default modulo;
