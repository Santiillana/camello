import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { DB_NAME, DB_VERSION, SCHEMA_STATEMENTS } from './schema';
import type {
  CarteraItem,
  ConfiguracionApp,
  Cliente,
  MascotaConCliente,
  Mascota,
  Producto,
  Ruta,
  Venta,
  ClienteConResumen,
  RutaConResumen,
  ResumenPeriodo,
  EstadoSeguimiento,
  ModoRitmo,
  CategoriaFoto,
  Foto,
  CategoriaGasto,
  Gasto,
  ResultadoMes,
  TipoCategoriaGasto,
  NaturalezaGasto,
  EstadoGasto,
  Pago,
} from '../types';
import { diasDesdeISO, diasEntreISO, fechaLocalISO, horaLocalHHMM, sumarDiasISO } from '../utils/format';
import { initWebSqlite } from './initWebSqlite';
import { calcularChecksum } from '../utils/respaldo';
import { crearContexto } from '../modulos/runtime';

type SqliteExportData = Record<string, unknown> & {
  database: string;
  mode: string;
  encrypted?: boolean;
  tables: unknown[];
};

const DEFAULT_CONFIG: ConfiguracionApp = {
  negocio_nombre: '',
  usuario_nombre: '',
  color_acento: '#c2642b',
  moneda: 'COP',
  mensaje_recordatorio: 'Hola {nombre}, ¿cómo están? Ya podría ser momento de su próxima compra en COMBOPITT.',
};

function normalizarTextoBusqueda(valor: string): string {
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizarTelefono(valor?: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

function escaparGlob(valor: string): string {
  let salida = '';
  for (const caracter of valor) {
    if (caracter === '\\') salida += '[\\\\]';
    else if (caracter === '*') salida += '[*]';
    else if (caracter === '?') salida += '[?]';
    else if (caracter === '[') salida += '[[]';
    else salida += caracter;
  }
  return salida;
}

function validarMesDia(mes: number | undefined, dia: number | undefined, campo: string): void {
  if (mes == null && dia == null) return;
  if (mes == null || dia == null || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    throw new Error(`${campo}: indica día y mes válidos.`);
  }
  const limite = new Date(2000, mes, 0).getDate();
  if (mes < 1 || mes > 12 || dia < 1 || dia > limite) throw new Error(`${campo}: la fecha no es válida.`);
}

function minutosEntre(horaInicio?: string, horaFin?: string): number | null {
  if (!horaInicio || !horaFin) return null;
  const inicioPartes = horaInicio.split(':').map(Number);
  const finPartes = horaFin.split(':').map(Number);
  if (![...inicioPartes, ...finPartes].every(Number.isInteger)) return null;
  let inicio = inicioPartes[0] * 60 + inicioPartes[1];
  let fin = finPartes[0] * 60 + finPartes[1];
  if (fin < inicio) fin += 24 * 60;
  return fin - inicio;
}

export const UMBRAL_POR_CONTACTAR_DIAS = 20;
export const UMBRAL_INACTIVO_DIAS = 45;

const CAMPOS_CLIENTE_EDITABLES = new Set([
  'nombre',
  'telefono1',
  'telefono2',
  'cumple_dia',
  'cumple_mes',
  'fecha_registro',
  'lat',
  'lng',
  'ubicacion_precision_m',
  'ubicacion_fuente',
  'ubicacion_fecha',
  'observaciones',
  'estado',
]);

function textoObligatorio(valor: string, campo: string): string {
  const resultado = valor.trim();
  if (!resultado) throw new Error(`${campo} es obligatorio.`);
  return resultado;
}

function textoLimitado(valor: string | undefined, campo: string, maximo: number): string | null {
  if (valor == null) return null;
  const resultado = valor.trim();
  if (resultado.length > maximo) throw new Error(`${campo} supera el límite de ${maximo} caracteres.`);
  return resultado || null;
}

function numeroNoNegativo(valor: number, campo: string): number {
  if (!Number.isSafeInteger(valor) || valor < 0) {
    throw new Error(campo + ' debe ser un número entero de pesos COP mayor o igual a 0.');
  }
  return valor;
}

function multiplicarDinero(entero: number, cantidad: number, campo: string): number {
  const resultado = entero * cantidad;
  if (!Number.isSafeInteger(resultado)) throw new Error(campo + ' excede el límite seguro de cálculo.');
  return resultado;
}

function enteroPositivo(valor: number, campo: string): number {
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${campo} debe ser un número entero mayor que 0.`);
  }
  return valor;
}

function coordenadaValida(valor: number | undefined, minimo: number, maximo: number): boolean {
  return valor == null || (Number.isFinite(valor) && valor >= minimo && valor <= maximo);
}

function juliandayDiff(desde: string, hasta: string): number {
  const a = new Date(desde + 'T00:00:00Z').getTime();
  const b = new Date(hasta + 'T00:00:00Z').getTime();
  return (a - b) / 86400000;
}

function marcarEtapaSqlite(etapa: string): void {
  if (import.meta.env.VITE_E2E === '1') document.documentElement.dataset.camelloSqliteStage = etapa;
}

class Database {
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private activeDbName = DB_NAME;
  private ready: Promise<void> | null = null;

  init(): Promise<void> {
    if (!this.ready) this.ready = this._init();
    return this.ready;
  }

  private async _init(): Promise<void> {
    marcarEtapaSqlite('connection');
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    if (Capacitor.getPlatform() === 'web') {
      await initWebSqlite();
      marcarEtapaSqlite('webstore');
      await this.sqlite.initWebStore();
    }

    marcarEtapaSqlite('open');
    await this.abrirConexion();
    marcarEtapaSqlite('schema');
    await this.prepararEsquema();
    marcarEtapaSqlite('health');
    await this.verificarSalud();
    marcarEtapaSqlite('seed');
    await this.seedProductosSiVacio();
    marcarEtapaSqlite('persist');
    await this.persist();
  }

  private async nombreBaseExistente(): Promise<string> {
    if (!this.sqlite) throw new Error('Conexión SQLite no disponible.');

    try {
      marcarEtapaSqlite('database-list');
      const listado = await this.sqlite.getDatabaseList();
      marcarEtapaSqlite('database-list-ok');
      const nombres = (listado.values ?? [])
        .map((row) => {
          if (typeof row === 'string') return row;
          if (row && typeof row === 'object') {
            const value = row as Record<string, unknown>;
            return String(value.database ?? value.name ?? value[0] ?? '');
          }
          return '';
        })
        .filter((name) => name && name !== 'database');

      if (nombres.includes(DB_NAME + '.db')) return DB_NAME + '.db';
      if (nombres.includes(DB_NAME)) return DB_NAME;
    } catch {
      // Algunas plataformas pueden no exponer la lista en este momento.
    }

    return DB_NAME;
  }

  private async abrirConexion(): Promise<void> {
    if (!this.sqlite) throw new Error('Conexión SQLite no disponible.');

    this.activeDbName = await this.nombreBaseExistente();
    marcarEtapaSqlite('consistency');
    const consistency = await this.sqlite.checkConnectionsConsistency();
    marcarEtapaSqlite('consistency-ok');
    marcarEtapaSqlite('is-connection');
    const isConn = (await this.sqlite.isConnection(this.activeDbName, false)).result;
    marcarEtapaSqlite('is-connection-ok');
    this.db = consistency.result && isConn
      ? await this.sqlite.retrieveConnection(this.activeDbName, false)
      : await this.sqlite.createConnection(this.activeDbName, false, 'no-encryption', DB_VERSION, false);
    marcarEtapaSqlite('connection-object-ok');

    marcarEtapaSqlite('db-open');
    await this.db.open();
    marcarEtapaSqlite('db-open-ok');
    await this.db.execute('PRAGMA foreign_keys = ON;');
    marcarEtapaSqlite('foreign-keys-ok');
  }

  private async prepararEsquema(): Promise<void> {
    const db = this.conn();
    for (const stmt of SCHEMA_STATEMENTS.filter((statement) => /^CREATE TABLE IF NOT EXISTS /i.test(statement.trim()))) {
      await db.execute(stmt);
    }
    const versionResult = await db.query('PRAGMA user_version;');
    const version = Number(versionResult.values?.[0]?.user_version ?? 0);
    if (version > DB_VERSION) throw new Error('La base de datos usa una versión de esquema más nueva (' + version + ') que esta app (' + DB_VERSION + ').');

    const clientesColumnas = await this.columnasDeTabla('clientes');
    const ventasColumnas = await this.columnasDeTabla('ventas');
    const rutasColumnas = await this.columnasDeTabla('rutas');
    const esBaseNuevaCanonical =
      version === 0 &&
      clientesColumnas.has('nombre_normalizado') &&
      clientesColumnas.has('ubicacion_precision_m') &&
      ventasColumnas.has('operacion_id') &&
      ventasColumnas.has('estado_registro') &&
      rutasColumnas.has('paquetes_sobrantes');

    if (esBaseNuevaCanonical) {
      for (const stmt of SCHEMA_STATEMENTS.filter((statement) => /^CREATE (INDEX|TRIGGER) IF NOT EXISTS /i.test(statement.trim()))) {
        await db.execute(stmt, false);
      }
      await db.execute('PRAGMA user_version = ' + DB_VERSION + ';', false);
      await this.verificarEsquemaCompleto();
      return;
    }

    const migraciones = [
      { version: 2, ejecutar: () => this.migrarVersion2() },
      { version: 3, ejecutar: () => this.migrarVersion3() },
      { version: 4, ejecutar: () => this.migrarVersion4() },
      { version: 5, ejecutar: () => this.migrarVersion5() },
      { version: 6, ejecutar: () => this.migrarVersion6() },
      { version: 7, ejecutar: () => this.migrarVersion7() },
      { version: 8, ejecutar: () => this.migrarVersion8() },
      { version: 9, ejecutar: () => this.migrarVersion9() },
      { version: 10, ejecutar: () => this.migrarVersion10() },
      { version: 11, ejecutar: () => this.migrarVersion11() },
      { version: 12, ejecutar: () => this.migrarVersion12() },
      { version: 13, ejecutar: () => this.migrarVersion13() },
      { version: 14, ejecutar: () => this.migrarVersion14() },
    ];
    for (const migracion of migraciones) {
      if (version < migracion.version) await migracion.ejecutar();
    }
    // v9 es una reparación idempotente: también corre sobre bases que ya
    // tengan user_version alto si quedaron referencias a tablas temporales.
    await this.migrarVersion9();
    for (const stmt of SCHEMA_STATEMENTS.filter((statement) => /^CREATE (INDEX|TRIGGER) IF NOT EXISTS /i.test(statement.trim()))) {
      await db.execute(stmt);
    }
    await db.execute('PRAGMA user_version = ' + DB_VERSION + ';');
    await this.verificarEsquemaCompleto();
  }

  private async columnasDeTabla(tabla: string): Promise<Map<string, string>> {
    const r = await this.conn().query('PRAGMA table_info(' + tabla + ');');
    return new Map((r.values ?? []).map((row) => [String(row.name), String(row.type ?? '').toUpperCase()]));
  }

  private async migrarVersion2(): Promise<void> {
    const columnas = await this.columnasDeTabla('rutas');
    if (!columnas.has('nombre')) await this.conn().execute("ALTER TABLE rutas ADD COLUMN nombre TEXT NOT NULL DEFAULT '';");
    if (!columnas.has('fecha_planificada')) await this.conn().execute('ALTER TABLE rutas ADD COLUMN fecha_planificada TEXT;');
    if (!columnas.has('hora_planificada')) await this.conn().execute('ALTER TABLE rutas ADD COLUMN hora_planificada TEXT;');
  }

  private async migrarVersion3(): Promise<void> {
    const productos = await this.columnasDeTabla('productos');
    const ventas = await this.columnasDeTabla('ventas');
    const productosListos = productos.get('precio') === 'INTEGER' && productos.get('costo') === 'INTEGER';
    const ventasListas = ventas.get('precio_aplicado') === 'INTEGER' && ventas.get('costo_aplicado') === 'INTEGER' && ventas.get('total') === 'INTEGER' && ventas.get('utilidad') === 'INTEGER' && ventas.has('metodo_pago') && ventas.has('monto_pagado') && ventas.has('operacion_id');
    if (productosListos && ventasListas) return;
    const db = this.conn();
    await db.execute('PRAGMA foreign_keys = OFF;', false);
    try {
      await db.beginTransaction();
      if (!productosListos) {
        await db.execute('ALTER TABLE productos RENAME TO productos_migracion_v3;', false);
        await db.execute('CREATE TABLE productos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, precio INTEGER NOT NULL, costo INTEGER NOT NULL, activo INTEGER NOT NULL DEFAULT 1);', false);
        await db.execute('INSERT INTO productos (id, nombre, precio, costo, activo) SELECT id, nombre, CAST(ROUND(precio) AS INTEGER), CAST(ROUND(costo) AS INTEGER), activo FROM productos_migracion_v3;', false);
        await db.execute('DROP TABLE productos_migracion_v3;', false);
      }
      if (!ventasListas) {
        await db.execute('DROP INDEX IF EXISTS idx_ventas_cliente;', false);
        await db.execute('DROP INDEX IF EXISTS idx_ventas_ruta;', false);
        await db.execute('DROP INDEX IF EXISTS idx_ventas_fecha;', false);
        const metodo = ventas.has('metodo_pago') ? "COALESCE(metodo_pago, CASE WHEN estado_pago = 'PAGADA' THEN 'EFECTIVO' ELSE 'FIADO' END)" : "CASE WHEN estado_pago = 'PAGADA' THEN 'EFECTIVO' ELSE 'FIADO' END";
        const monto = ventas.has('monto_pagado') ? "MIN(MAX(CAST(ROUND(COALESCE(monto_pagado, 0)) AS INTEGER), 0), CAST(ROUND(total) AS INTEGER))" : "CASE WHEN estado_pago = 'PAGADA' THEN CAST(ROUND(total) AS INTEGER) ELSE 0 END";
        const operacion = ventas.has('operacion_id') ? 'operacion_id' : 'NULL';
        await db.execute('ALTER TABLE ventas RENAME TO ventas_migracion_v3;', false);
        await db.execute("CREATE TABLE ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL, ruta_id INTEGER, producto_nombre TEXT NOT NULL, cantidad INTEGER NOT NULL DEFAULT 1, precio_aplicado INTEGER NOT NULL, costo_aplicado INTEGER NOT NULL, total INTEGER NOT NULL, utilidad INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, estado_pago TEXT NOT NULL DEFAULT 'PENDIENTE', fecha_pago TEXT, metodo_pago TEXT NOT NULL DEFAULT 'EFECTIVO', monto_pagado INTEGER NOT NULL DEFAULT 0, operacion_id TEXT UNIQUE, FOREIGN KEY (cliente_id) REFERENCES clientes(id), FOREIGN KEY (ruta_id) REFERENCES rutas(id), CHECK (monto_pagado >= 0 AND monto_pagado <= total));", false);
        await db.execute('INSERT INTO ventas (id, cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago, metodo_pago, monto_pagado, operacion_id) SELECT id, cliente_id, ruta_id, producto_nombre, cantidad, CAST(ROUND(precio_aplicado) AS INTEGER), CAST(ROUND(costo_aplicado) AS INTEGER), CAST(ROUND(total) AS INTEGER), CAST(ROUND(utilidad) AS INTEGER), fecha, hora, estado_pago, fecha_pago, ' + metodo + ', ' + monto + ', ' + operacion + ' FROM ventas_migracion_v3;', false);
        await db.execute('DROP TABLE ventas_migracion_v3;', false);
      }
      await db.execute('CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);', false);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);', false);
      await db.execute('CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);', false);
      await db.commitTransaction();
    } catch (error) {
      try { await db.rollbackTransaction(); } catch { /* La transacción ya puede haberse revertido. */ }
      throw error;
    } finally {
      await db.execute('PRAGMA foreign_keys = ON;', false);
    }
  }

  private async migrarVersion4(): Promise<void> {
    const clientes = await this.columnasDeTabla('clientes');
    if (!clientes.has('ubicacion_precision_m')) await this.conn().execute('ALTER TABLE clientes ADD COLUMN ubicacion_precision_m REAL;');
    if (!clientes.has('ubicacion_fuente')) await this.conn().execute('ALTER TABLE clientes ADD COLUMN ubicacion_fuente TEXT;');
    if (!clientes.has('ubicacion_fecha')) await this.conn().execute('ALTER TABLE clientes ADD COLUMN ubicacion_fecha TEXT;');
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      categoria TEXT NOT NULL,
      referencia TEXT,
      data_url TEXT NOT NULL,
      creado_at TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );`);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_fotos_cliente ON fotos(cliente_id);');
  }

  private async migrarVersion5(): Promise<void> {
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      cliente_id INTEGER NOT NULL,
      monto INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      metodo_pago TEXT NOT NULL,
      operacion_id TEXT UNIQUE,
      FOREIGN KEY (venta_id) REFERENCES ventas(id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      CHECK (monto > 0)
    );`);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_pagos_cliente_fecha ON pagos(cliente_id, fecha);');
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);');
    const pagosExistentes = await this.conn().query('SELECT COUNT(*) as n FROM pagos;');
    const hayPagos = Number(pagosExistentes.values?.[0]?.n ?? 0) > 0;
    if (!hayPagos) {
      const pagadas = await this.conn().query(`
        SELECT id, cliente_id, total, fecha, hora, COALESCE(metodo_pago, 'EFECTIVO') as metodo_pago
        FROM ventas
        WHERE estado_pago = 'PAGADA' AND COALESCE(monto_pagado, total) > 0;
      `);
      for (const row of pagadas.values ?? []) {
        await this.conn().run(
          'INSERT INTO pagos (venta_id, cliente_id, monto, fecha, hora, metodo_pago) VALUES (?, ?, ?, ?, ?, ?);',
          [Number(row.id), Number(row.cliente_id), Number(row.total), String(row.fecha), String(row.hora), String(row.metodo_pago || 'EFECTIVO')],
          false,
        );
      }
    }
  }

  private async migrarVersion6(): Promise<void> {
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS seguimiento_clientes (
      cliente_id INTEGER PRIMARY KEY,
      modo TEXT NOT NULL DEFAULT 'automatico',
      dias INTEGER,
      contactado_fecha TEXT,
      recordar_hasta TEXT,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );`);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_seguimiento_recordar ON seguimiento_clientes(recordar_hasta);');
  }

  private async migrarVersion7(): Promise<void> {
    const rutas = await this.columnasDeTabla('rutas');
    if (!rutas.has('paquetes_sobrantes')) {
      await this.conn().execute('ALTER TABLE rutas ADD COLUMN paquetes_sobrantes INTEGER NOT NULL DEFAULT 0;');
    }
  }

  private async migrarVersion8(): Promise<void> {
    const rutas = await this.columnasDeTabla('rutas');
    const necesitaRehacer = rutas.has('fecha_planificada') || rutas.has('hora_planificada');
    if (!necesitaRehacer) return;

    const db = this.conn();
    const snapshot = await db.query(`
      SELECT id, nombre, tipo, estado, fecha, hora_inicio, hora_fin,
        lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados,
        COALESCE(paquetes_sobrantes, 0) AS paquetes_sobrantes, notas
      FROM rutas
      ORDER BY id;
    `);

    // No usar ALTER TABLE ... RENAME sobre rutas: SQLite puede reescribir
    // las FK de tablas hijas para apuntar al nombre temporal.
    await db.execute('PRAGMA foreign_keys = OFF;', false);
    let reemplazoCreado = false;
    try {
      await db.execute('DROP TABLE IF EXISTS rutas_reconstruccion_v8;', false);
      await db.execute(`CREATE TABLE rutas_reconstruccion_v8 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL DEFAULT '',
        tipo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'EN_CURSO',
        fecha TEXT NOT NULL,
        hora_inicio TEXT,
        hora_fin TEXT,
        lat_inicio REAL,
        lng_inicio REAL,
        lat_fin REAL,
        lng_fin REAL,
        paquetes_llevados INTEGER NOT NULL DEFAULT 0,
        paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
        notas TEXT
      );`, false);
      await db.execute(`INSERT INTO rutas_reconstruccion_v8 (
        id, nombre, tipo, estado, fecha, hora_inicio, hora_fin,
        lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados,
        paquetes_sobrantes, notas
      ) SELECT
        id, nombre, tipo,
        CASE WHEN estado = 'PROGRAMADA' THEN 'CANCELADA' ELSE estado END,
        fecha, hora_inicio, hora_fin, lat_inicio, lng_inicio, lat_fin,
        lng_fin, paquetes_llevados, COALESCE(paquetes_sobrantes, 0), notas
      FROM rutas;`, false);
      await db.execute('DROP TABLE rutas;', false);
      await db.execute(`CREATE TABLE rutas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL DEFAULT '',
        tipo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'EN_CURSO',
        fecha TEXT NOT NULL,
        hora_inicio TEXT,
        hora_fin TEXT,
        lat_inicio REAL,
        lng_inicio REAL,
        lat_fin REAL,
        lng_fin REAL,
        paquetes_llevados INTEGER NOT NULL DEFAULT 0,
        paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
        notas TEXT
      );`, false);
      await db.execute(`INSERT INTO rutas (
        id, nombre, tipo, estado, fecha, hora_inicio, hora_fin,
        lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados,
        paquetes_sobrantes, notas
      ) SELECT id, nombre, tipo, estado, fecha, hora_inicio, hora_fin,
        lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados,
        paquetes_sobrantes, notas
      FROM rutas_reconstruccion_v8;`, false);
      await db.execute('DROP TABLE rutas_reconstruccion_v8;', false);
      reemplazoCreado = true;
      const rutaIndex = `CREATE INDEX IF NOT EXISTS idx_ventas_ruta ON ventas(ruta_id);`;
      await db.execute(rutaIndex, false);
      const despues = await db.query('SELECT COUNT(*) AS n, COALESCE(SUM(paquetes_llevados), 0) AS llevados, COALESCE(SUM(paquetes_sobrantes), 0) AS sobrantes FROM rutas;');
      const filasAntes = Number((snapshot.values ?? []).length);
      const filasDespues = Number(despues.values?.[0]?.n ?? 0);
      if (filasAntes !== filasDespues) throw new Error('La migración v8 cambió el conteo de rutas.');
    } catch (error) {
      // Sin transacción explícita: si el proceso quedó a mitad, restauramos
      // rutas desde el snapshot para no dejar una tabla incompleta.
      try {
        await db.execute('DROP TABLE IF EXISTS rutas_reconstruccion_v8;', false);
        await db.execute('DROP TABLE IF EXISTS rutas;', false);
        await db.execute(`CREATE TABLE rutas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL DEFAULT '',
          tipo TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'EN_CURSO',
          fecha TEXT NOT NULL,
          hora_inicio TEXT,
          hora_fin TEXT,
          lat_inicio REAL,
          lng_inicio REAL,
          lat_fin REAL,
          lng_fin REAL,
          paquetes_llevados INTEGER NOT NULL DEFAULT 0,
          paquetes_sobrantes INTEGER NOT NULL DEFAULT 0,
          notas TEXT
        );`, false);
        for (const row of (snapshot.values ?? []) as unknown[][]) {
          await db.run(
            `INSERT INTO rutas (
              id, nombre, tipo, estado, fecha, hora_inicio, hora_fin,
              lat_inicio, lng_inicio, lat_fin, lng_fin, paquetes_llevados,
              paquetes_sobrantes, notas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            row.map((value) => value == null ? null : value),
            false,
          );
        }
      } catch {
        // El error original conserva más contexto.
      }
      throw error;
    } finally {
      await db.execute('PRAGMA foreign_keys = ON;', false);
    }
    if (!reemplazoCreado) throw new Error('La reconstrucción v8 no terminó.');
    const fk = await db.query('PRAGMA foreign_key_check;');
    if ((fk.values ?? []).length > 0) throw new Error('La migración v8 dejó claves foráneas inválidas.');
  }

  private async migrarVersion9(): Promise<void> {
    const db = this.conn();
    const referencias = await db.query(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_master
      WHERE sql IS NOT NULL AND sql LIKE '%\\_migracion\\_%' ESCAPE '\\';
    `);
    const objetos = (referencias.values ?? []).map((row) => ({
      type: String(row.type ?? ''),
      name: String(row.name ?? ''),
      tbl_name: String(row.tbl_name ?? ''),
      sql: String(row.sql ?? ''),
    }));
    if (!objetos.length) return;

    const temporales = new Set<string>();
    const extraer = /\b[A-Za-z_][A-Za-z0-9]*_migracion_[A-Za-z0-9_]*\b/g;
    for (const objeto of objetos) {
      for (const match of objeto.sql.match(extraer) ?? []) temporales.add(match);
      if (objeto.name.includes('_migracion_')) temporales.add(objeto.name);
    }
    const reemplazos = new Map<string, string>();
    for (const temporal of temporales) {
      const base = temporal.split('_migracion_')[0];
      if (base) reemplazos.set(temporal, base);
    }

    const normalizarSql = (sql: string): string => {
      let resultado = sql;
      for (const [temporal, canonical] of reemplazos) {
        resultado = resultado.split(temporal).join(canonical);
      }
      return resultado;
    };

    const objetosNoTabla = objetos.filter((objeto) => objeto.type !== 'table');
    for (const objeto of objetosNoTabla) {
      const quoted = '"' + objeto.name.replace(/"/g, '""') + '"';
      if (objeto.type === 'index') await db.execute('DROP INDEX IF EXISTS ' + quoted + ';', false);
      if (objeto.type === 'trigger') await db.execute('DROP TRIGGER IF EXISTS ' + quoted + ';', false);
      if (objeto.type === 'view') await db.execute('DROP VIEW IF EXISTS ' + quoted + ';', false);
    }

    const afectadas = objetos.filter((objeto) =>
      objeto.type === 'table' &&
      !objeto.name.includes('_migracion_') &&
      Array.from(reemplazos.keys()).some((temporal) => objeto.sql.includes(temporal))
    );

    const sentenciaTabla = (nombre: string): string => {
      const sentencia = SCHEMA_STATEMENTS.find((statement) =>
        statement.trimStart().startsWith('CREATE TABLE IF NOT EXISTS ' + nombre + ' '),
      );
      if (!sentencia) throw new Error('No existe esquema canónico para reconstruir ' + nombre + '.');
      return sentencia;
    };

    await db.execute('PRAGMA foreign_keys = OFF;', false);
    try {
      for (const objeto of afectadas) {
        const nombre = objeto.name;
        const originalCols = await this.columnasDeTabla(nombre);
        const create = sentenciaTabla(nombre);
        const reparacion = nombre + '_reparacion_v9';
        await db.execute('DROP TABLE IF EXISTS ' + reparacion + ';', false);
        await db.execute(create.replace('CREATE TABLE IF NOT EXISTS ' + nombre, 'CREATE TABLE ' + reparacion), false);
        const nuevasCols = await this.columnasDeTabla(reparacion);
        const comunes = Array.from(originalCols.keys()).filter((columna) => nuevasCols.has(columna));
        if (!comunes.length) throw new Error('No hay columnas comunes para reparar ' + nombre + '.');
        const lista = comunes.map((columna) => '"' + columna.replace(/"/g, '""') + '"').join(', ');
        await db.execute(`INSERT INTO ${reparacion} (${lista}) SELECT ${lista} FROM ${nombre};`, false);
        await db.execute('DROP TABLE ' + nombre + ';', false);
        await db.execute(create, false);
        await db.execute(`INSERT INTO ${nombre} (${lista}) SELECT ${lista} FROM ${reparacion};`, false);
        await db.execute('DROP TABLE ' + reparacion + ';', false);
      }

      const tablasTemporales = objetos.filter((objeto) => objeto.type === 'table' && objeto.name.includes('_migracion_'));
      for (const objeto of tablasTemporales) {
        const canonical = reemplazos.get(objeto.name);
        if (!canonical) continue;
        const existeCanonica = await db.query(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?;`, [canonical]);
        if (Number(existeCanonica.values?.[0]?.n ?? 0) > 0) {
          const filasTemp = await db.query('SELECT COUNT(*) AS n FROM ' + objeto.name + ';');
          if (Number(filasTemp.values?.[0]?.n ?? 0) === 0) await db.execute('DROP TABLE ' + objeto.name + ';', false);
          else throw new Error('Quedó una tabla temporal con datos: ' + objeto.name);
        }
      }
    } finally {
      await db.execute('PRAGMA foreign_keys = ON;', false);
    }

    for (const objeto of objetosNoTabla) {
      const sql = normalizarSql(objeto.sql);
      if (sql) await db.execute(sql, false);
    }

    const restantes = await db.query(`
      SELECT type, name, sql
      FROM sqlite_master
      WHERE sql IS NOT NULL AND sql LIKE '%\\_migracion\\_%' ESCAPE '\\';
    `);
    if ((restantes.values ?? []).length) {
      throw new Error('Quedaron referencias a _migracion_ tras v9: ' + JSON.stringify(restantes.values));
    }
    const fk = await db.query('PRAGMA foreign_key_check;');
    if ((fk.values ?? []).length) throw new Error('v9: foreign_key_check no está vacío.');
    const integrity = await db.query('PRAGMA integrity_check;');
    const resultadoIntegrity = String(integrity.values?.[0]?.integrity_check ?? integrity.values?.[0]?.[0] ?? '');
    if (resultadoIntegrity.toLowerCase() !== 'ok') throw new Error('v9: integrity_check = ' + resultadoIntegrity);
  }

  private async migrarVersion10(): Promise<void> {
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS borradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      clave TEXT NOT NULL,
      json TEXT NOT NULL,
      paso INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(tipo, clave)
    );`, false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_borradores_updated ON borradores(updated_at);', false);
    await this.conn().execute(
      "DELETE FROM borradores WHERE updated_at < datetime('now', '-7 days');",
      false,
    );
  }

  async guardarBorrador(tipo: string, clave: string, datos: unknown, paso: number): Promise<void> {
    const json = JSON.stringify(datos);
    if (!Number.isInteger(paso) || paso < 0) throw new Error('El paso del borrador no es válido.');
    await this.conn().run(
      `INSERT INTO borradores (tipo, clave, json, paso, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tipo, clave) DO UPDATE SET
         json = excluded.json,
         paso = excluded.paso,
         updated_at = excluded.updated_at;`,
      [tipo, clave, json, paso, new Date().toISOString()],
      false,
    );
    await this.persist();
  }

  async obtenerBorrador<T>(tipo: string, clave: string): Promise<{ datos: T; paso: number; updated_at: string } | null> {
    const result = await this.conn().query(
      'SELECT json, paso, updated_at FROM borradores WHERE tipo = ? AND clave = ? LIMIT 1;',
      [tipo, clave],
    );
    const row = result.values?.[0];
    if (!row) return null;
    try {
      return {
        datos: JSON.parse(String(row.json)) as T,
        paso: Number(row.paso ?? 0),
        updated_at: String(row.updated_at ?? ''),
      };
    } catch {
      await this.eliminarBorrador(tipo, clave);
      return null;
    }
  }

  async eliminarBorrador(tipo: string, clave: string): Promise<void> {
    await this.conn().run(
      'DELETE FROM borradores WHERE tipo = ? AND clave = ?;',
      [tipo, clave],
      false,
    );
    await this.persist();
  }


  private async migrarVersion11(): Promise<void> {
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS categorias_gasto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL CHECK (tipo IN ('fijo','variable')),
      naturaleza TEXT NOT NULL CHECK (naturaleza IN ('operativo','compra_insumos','retiro_dueno')),
      presupuesto_mensual INTEGER,
      activa INTEGER NOT NULL DEFAULT 1,
      orden INTEGER NOT NULL DEFAULT 0
    );`, false);
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      monto INTEGER NOT NULL CHECK (monto > 0),
      categoria_id INTEGER NOT NULL,
      descripcion TEXT,
      metodo_pago TEXT,
      estado TEXT NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pagado','pendiente','anulado')),
      fecha_pago TEXT,
      fecha_limite TEXT,
      proveedor TEXT,
      ruta_id INTEGER,
      recurrente_id INTEGER,
      periodo TEXT NOT NULL,
      foto_ref TEXT,
      operacion_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archivado INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (categoria_id) REFERENCES categorias_gasto(id),
      FOREIGN KEY (ruta_id) REFERENCES rutas(id)
    );`, false);
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS gastos_recurrentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      monto_estimado INTEGER NOT NULL CHECK (monto_estimado > 0),
      dia_vencimiento INTEGER NOT NULL CHECK (dia_vencimiento BETWEEN 1 AND 31),
      activo INTEGER NOT NULL DEFAULT 1,
      UNIQUE(categoria_id, nombre),
      FOREIGN KEY (categoria_id) REFERENCES categorias_gasto(id)
    );`, false);
    for (const [nombre, tipo, naturaleza, orden] of [
      ['Arriendo', 'fijo', 'operativo', 1],
      ['Servicios', 'fijo', 'operativo', 2],
      ['Gas', 'variable', 'operativo', 3],
      ['Transporte/Gasolina', 'variable', 'operativo', 4],
      ['Empaques', 'variable', 'operativo', 5],
      ['Publicidad', 'variable', 'operativo', 6],
      ['Mantenimiento', 'variable', 'operativo', 7],
      ['Otros', 'variable', 'operativo', 8],
      ['Compra de materia prima', 'variable', 'compra_insumos', 9],
      ['Retiro del dueño', 'variable', 'retiro_dueno', 10],
    ] as const) {
      await this.conn().run(
        `INSERT INTO categorias_gasto (nombre, tipo, naturaleza, orden) VALUES (?, ?, ?, ?)
         ON CONFLICT(nombre) DO NOTHING;`,
        [nombre, tipo, naturaleza, orden],
        false,
      );
    }
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_gastos_periodo ON gastos(periodo);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria_id);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_gastos_estado ON gastos(estado);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_gastos_ruta ON gastos(ruta_id);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_recurrentes_categoria ON gastos_recurrentes(categoria_id);', false);
  }

  async listarGastosRecurrentes(): Promise<Array<{ id: number; categoria_id: number; nombre: string; monto_estimado: number; dia_vencimiento: number; activo: 0 | 1; categoria_nombre?: string }>> {
    const r = await this.conn().query(
      `SELECT r.*, c.nombre AS categoria_nombre FROM gastos_recurrentes r
       JOIN categorias_gasto c ON c.id=r.categoria_id ORDER BY r.activo DESC, r.nombre;`,
    );
    return (r.values ?? []) as Array<{ id: number; categoria_id: number; nombre: string; monto_estimado: number; dia_vencimiento: number; activo: 0 | 1; categoria_nombre?: string }>;
  }

  async crearGastoRecurrente(data: { categoria_id: number; nombre: string; monto_estimado: number; dia_vencimiento: number }): Promise<number> {
    const nombre = textoObligatorio(data.nombre, 'El nombre del gasto fijo').slice(0, 100);
    const monto = enteroPositivo(data.monto_estimado, 'El monto estimado');
    if (!Number.isInteger(data.dia_vencimiento) || data.dia_vencimiento < 1 || data.dia_vencimiento > 31) throw new Error('El día de vencimiento debe estar entre 1 y 31.');
    const cat = await this.conn().query('SELECT id FROM categorias_gasto WHERE id=? AND activa=1;', [data.categoria_id]);
    if (!cat.values?.length) throw new Error('La categoría no existe.');
    const r = await this.conn().run(
      'INSERT INTO gastos_recurrentes (categoria_id,nombre,monto_estimado,dia_vencimiento) VALUES (?,?,?,?);',
      [data.categoria_id,nombre,monto,data.dia_vencimiento],
    );
    await this.persist();
    return Number(r.changes?.lastId ?? 0);
  }

  async archivarGastoRecurrente(id: number): Promise<void> {
    await this.conn().run('UPDATE gastos_recurrentes SET activo=0 WHERE id=?;', [id]);
    await this.persist();
  }

  async listarCategoriasGasto(incluirInactivas = false): Promise<CategoriaGasto[]> {
    const r = await this.conn().query(
      'SELECT * FROM categorias_gasto ' + (incluirInactivas ? '' : 'WHERE activa = 1 ') + 'ORDER BY orden, nombre;',
    );
    return (r.values ?? []) as CategoriaGasto[];
  }

  async crearCategoriaGasto(data: { nombre: string; tipo: TipoCategoriaGasto; naturaleza: NaturalezaGasto; presupuesto_mensual?: number | null }): Promise<number> {
    const nombre = textoObligatorio(data.nombre, 'El nombre de la categoría').slice(0, 80);
    if (data.presupuesto_mensual != null) numeroNoNegativo(data.presupuesto_mensual, 'El presupuesto');
    const r = await this.conn().run(
      'INSERT INTO categorias_gasto (nombre, tipo, naturaleza, presupuesto_mensual, orden) VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(orden)+1 FROM categorias_gasto),1));',
      [nombre, data.tipo, data.naturaleza, data.presupuesto_mensual ?? null],
    );
    await this.persist();
    return Number(r.changes?.lastId ?? 0);
  }

  async actualizarCategoriaGasto(id: number, data: Partial<Pick<CategoriaGasto, 'nombre'|'tipo'|'naturaleza'|'presupuesto_mensual'>>): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Categoría inválida.');
    const campos: string[] = [];
    const values: unknown[] = [];
    if (data.nombre !== undefined) { campos.push('nombre = ?'); values.push(textoObligatorio(data.nombre, 'El nombre de la categoría').slice(0, 80)); }
    if (data.tipo !== undefined) { campos.push('tipo = ?'); values.push(data.tipo); }
    if (data.naturaleza !== undefined) { campos.push('naturaleza = ?'); values.push(data.naturaleza); }
    if (data.presupuesto_mensual !== undefined) { if (data.presupuesto_mensual != null) numeroNoNegativo(data.presupuesto_mensual, 'El presupuesto'); campos.push('presupuesto_mensual = ?'); values.push(data.presupuesto_mensual); }
    if (!campos.length) return;
    await this.conn().run('UPDATE categorias_gasto SET ' + campos.join(', ') + ' WHERE id = ?;', [...values, id]);
    await this.persist();
  }

  async archivarCategoriaGasto(id: number): Promise<void> {
    await this.conn().run('UPDATE categorias_gasto SET activa = 0 WHERE id = ?;', [id]);
    await this.persist();
  }

  async reordenarCategoriaGasto(id: number, direccion: 'arriba' | 'abajo'): Promise<void> {
    const actual = await this.conn().query('SELECT id, orden FROM categorias_gasto WHERE id=?;', [id]);
    const row = actual.values?.[0];
    if (!row) throw new Error('Categoría inválida.');
    const delta = direccion === 'arriba' ? -1 : 1;
    const objetivo = await this.conn().query(
      'SELECT id, orden FROM categorias_gasto WHERE orden = ? LIMIT 1;',
      [Number(row.orden) + delta],
    );
    const otro = objetivo.values?.[0];
    if (!otro) return;
    await this.conn().beginTransaction();
    try {
      await this.conn().run('UPDATE categorias_gasto SET orden=? WHERE id=?;', [Number(otro.orden), id], false);
      await this.conn().run('UPDATE categorias_gasto SET orden=? WHERE id=?;', [Number(row.orden), Number(otro.id)], false);
      await this.conn().commitTransaction();
      await this.persist();
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch {}
      throw error;
    }
  }

  async listarGastos(opts?: { desde?: string; hasta?: string; categoriaId?: number; estado?: EstadoGasto }): Promise<Gasto[]> {
    const where = ['g.archivado = 0'];
    const params: unknown[] = [];
    if (opts?.desde && opts?.hasta) { where.push('g.fecha BETWEEN ? AND ?'); params.push(opts.desde, opts.hasta); }
    if (opts?.categoriaId) { where.push('g.categoria_id = ?'); params.push(opts.categoriaId); }
    if (opts?.estado) { where.push('g.estado = ?'); params.push(opts.estado); }
    const r = await this.conn().query(
      `SELECT g.*, c.nombre AS categoria_nombre, c.naturaleza
       FROM gastos g JOIN categorias_gasto c ON c.id = g.categoria_id
       WHERE ${where.join(' AND ')}
       ORDER BY g.fecha DESC, g.id DESC;`,
      params,
    );
    return (r.values ?? []) as Gasto[];
  }

  async crearGasto(data: {
    fecha: string; monto: number; categoria_id: number; descripcion?: string; metodo_pago?: string;
    estado: EstadoGasto; fecha_limite?: string; proveedor?: string; ruta_id?: number | null; foto_ref?: string; operacion_id?: string;
  }): Promise<number> {
    const monto = enteroPositivo(data.monto, 'El monto del gasto');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha)) throw new Error('La fecha del gasto no es válida.');
    if (data.descripcion && data.descripcion.length > 500) throw new Error('La descripción es demasiado larga.');
    if (data.proveedor && data.proveedor.length > 160) throw new Error('El proveedor es demasiado largo.');
    const categoria = await this.conn().query('SELECT id FROM categorias_gasto WHERE id = ? AND activa = 1;', [data.categoria_id]);
    if (!categoria.values?.length) throw new Error('La categoría no existe o está archivada.');
    const ruta = data.ruta_id == null ? null : Number(data.ruta_id);
    if (ruta != null) {
      const rr = await this.conn().query("SELECT id, estado FROM rutas WHERE id = ?;", [ruta]);
      if (!rr.values?.length || rr.values[0].estado !== 'EN_CURSO') throw new Error('Solo se puede asociar un gasto a una ruta en curso.');
    }
    const ahora = new Date().toISOString();
    const operacion = data.operacion_id?.trim() || null;
    if (operacion) {
      const previo = await this.conn().query('SELECT id FROM gastos WHERE operacion_id = ?;', [operacion]);
      if (previo.values?.length) return Number(previo.values[0].id);
    }
    const estado = data.estado;
    const fechaPago = estado === 'pagado' ? (data.fecha ?? fechaLocalISO()) : null;
    const r = await this.conn().run(
      `INSERT INTO gastos (fecha, monto, categoria_id, descripcion, metodo_pago, estado, fecha_pago, fecha_limite, proveedor, ruta_id, periodo, foto_ref, operacion_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [data.fecha, monto, data.categoria_id, data.descripcion?.trim() || null, data.metodo_pago?.trim() || null, estado, fechaPago, data.fecha_limite ?? null, data.proveedor?.trim() || null, ruta, data.fecha.slice(0,7), data.foto_ref ?? null, operacion, ahora, ahora],
    );
    await this.persist();
    return Number(r.changes?.lastId ?? 0);
  }

  async pagarGasto(id: number, montoReal: number, metodo: string): Promise<void> {
    const monto = enteroPositivo(montoReal, 'El monto real');
    const r = await this.conn().query('SELECT estado FROM gastos WHERE id = ? AND archivado = 0;', [id]);
    if (!r.values?.length) throw new Error('El gasto no existe.');
    await this.conn().run('UPDATE gastos SET monto = ?, estado = \'pagado\', metodo_pago = ?, fecha_pago = ?, updated_at = ? WHERE id = ?;', [monto, metodo, fechaLocalISO(), new Date().toISOString(), id]);
    await this.persist();
  }

  async archivarGasto(id: number): Promise<void> {
    await this.conn().run('UPDATE gastos SET archivado = 1, updated_at = ? WHERE id = ?;', [new Date().toISOString(), id]);
    await this.persist();
  }

  async anularGasto(id: number, motivo: string): Promise<void> {
    const m = textoObligatorio(motivo, 'El motivo de anulación').slice(0, 300);
    await this.conn().run("UPDATE gastos SET estado='anulado', descripcion=COALESCE(descripcion || ' | ', '') || ?, updated_at=? WHERE id=?;", ['ANULADO: ' + m, new Date().toISOString(), id]);
    await this.persist();
  }

  async sincronizarGastosRecurrentes(periodo: string): Promise<void> {
    const items = await this.conn().query('SELECT r.*, c.naturaleza FROM gastos_recurrentes r JOIN categorias_gasto c ON c.id=r.categoria_id WHERE r.activo=1;');
    for (const row of items.values ?? []) {
      const recurrenteId = Number(row.id);
      const existe = await this.conn().query('SELECT id FROM gastos WHERE recurrente_id=? AND periodo=?;', [recurrenteId, periodo]);
      if (existe.values?.length) continue;
      const fechaLimite = periodo + '-' + String(row.dia_vencimiento).padStart(2,'0');
      await this.conn().run(
        `INSERT INTO gastos (fecha, monto, categoria_id, descripcion, estado, fecha_limite, recurrente_id, periodo, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?);`,
        [periodo + '-01', Number(row.monto_estimado), Number(row.categoria_id), String(row.nombre), fechaLimite, recurrenteId, periodo, new Date().toISOString(), new Date().toISOString()],
      );
    }
    await this.persist();
  }

  async resultadoMes(periodo: string): Promise<ResultadoMes> {
    if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error('Periodo inválido.');
    const desde=periodo+'-01';
    const hasta=periodo+'-31';
    const ventas = await this.conn().query(
      `SELECT COALESCE(SUM(total),0) ventas, COALESCE(SUM(costo_aplicado*cantidad),0) costos,
              COALESCE((SELECT SUM(monto) FROM pagos WHERE fecha BETWEEN ? AND ? AND COALESCE(estado_registro,'activa')='activa'),0) cobrado
       FROM ventas WHERE fecha BETWEEN ? AND ? AND COALESCE(estado_registro,'activa')='activa';`,
      [desde,hasta,desde,hasta]
    );
    const gastos = await this.conn().query(
      `SELECT COALESCE(SUM(CASE WHEN c.naturaleza='operativo' THEN g.monto ELSE 0 END),0) operativo,
              COALESCE(SUM(CASE WHEN g.estado='pendiente' AND c.naturaleza='operativo' THEN g.monto ELSE 0 END),0) pendientes,
              COALESCE(SUM(CASE WHEN g.estado='pagado' THEN g.monto ELSE 0 END),0) pagados,
              COALESCE(SUM(CASE WHEN g.estado='pagado' AND c.naturaleza='operativo' THEN g.monto ELSE 0 END),0) pagados_operativo,
              COALESCE(SUM(CASE WHEN c.naturaleza='compra_insumos' THEN g.monto ELSE 0 END),0) compras_insumos,
              COALESCE(SUM(CASE WHEN c.naturaleza='retiro_dueno' THEN g.monto ELSE 0 END),0) retiros_dueno,
              COALESCE(SUM(CASE WHEN c.tipo='fijo' AND c.naturaleza='operativo' THEN g.monto ELSE 0 END),0) gastos_fijos
       FROM gastos g JOIN categorias_gasto c ON c.id=g.categoria_id
       WHERE g.periodo=? AND g.archivado=0 AND g.estado <> 'anulado';`,
      [periodo]
    );
    const row=ventas.values?.[0] ?? {};
    const gr=gastos.values?.[0] ?? {};
    const utilidadBruta=Number(row.ventas??0)-Number(row.costos??0);
    const op=Number(gr.operativo??0);
    return {
      periodo, ventas:Number(row.ventas??0), costo_materia_prima:Number(row.costos??0),
      utilidad_bruta:utilidadBruta, gastos_operativos:op, utilidad_neta:utilidadBruta-op,
      margen_neto:Number(row.ventas??0)>0 ? ((utilidadBruta-op)/Number(row.ventas))*100 : 0,
      cobrado:Number(row.cobrado??0), gastos_pagados:Number(gr.pagados??0),
      flujo_caja:Number(row.cobrado??0)-Number(gr.pagados??0), gastos_pendientes:Number(gr.pendientes??0)
    };
  }

  private async migrarVersion14(): Promise<void> {
    const add = async (table: string, column: string) => {
      const cols = await this.columnasDeTabla(table);
      if (!cols.has(column)) {
        await this.conn().execute('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' TEXT NOT NULL DEFAULT "";', false);
      }
    };
    await add('clientes','nombre_normalizado');
    await add('mascotas','nombre_normalizado');
    const clientes = await this.conn().query('SELECT id,nombre FROM clientes;');
    for (const row of clientes.values ?? []) await this.conn().run('UPDATE clientes SET nombre_normalizado=? WHERE id=?;', [normalizarTextoBusqueda(String(row.nombre ?? '')), Number(row.id)], false);
    const mascotas = await this.conn().query('SELECT id,nombre FROM mascotas;');
    for (const row of mascotas.values ?? []) await this.conn().run('UPDATE mascotas SET nombre_normalizado=? WHERE id=?;', [normalizarTextoBusqueda(String(row.nombre ?? '')), Number(row.id)], false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_clientes_nombre_norm ON clientes(nombre_normalizado);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_mascotas_nombre_norm ON mascotas(nombre_normalizado);', false);
  }

  private async migrarVersion13(): Promise<void> {
    await this.conn().execute(`CREATE TABLE IF NOT EXISTS modulos_migraciones (
      modulo_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      aplicada_at TEXT NOT NULL,
      PRIMARY KEY (modulo_id, version)
    );`, false);
  }

  async obtenerModuloHabilitado(moduloId: string): Promise<boolean> {
    const r = await this.conn().query('SELECT valor FROM configuracion_app WHERE clave = ?;', ['modulo_' + moduloId + '_activo']);
    const valor = r.values?.[0]?.valor;
    return valor === undefined ? true : String(valor) === '1';
  }

  async guardarModuloHabilitado(moduloId: string, habilitado: boolean): Promise<void> {
    await this.conn().run(
      'INSERT INTO configuracion_app (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor;',
      ['modulo_' + moduloId + '_activo', habilitado ? '1' : '0'],
    );
    await this.persist();
  }

  async limpiarModuloDatosPrefijados(moduloId: string): Promise<void> {
    if (!/^[a-z0-9_]+$/.test(moduloId)) throw new Error('ID de módulo inválido.');
    const tablas = await this.conn().query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?;",
      ['mod_' + moduloId + '_%'],
    );
    await this.conn().beginTransaction();
    try {
      for (const row of tablas.values ?? []) {
        const table = String(row.name);
        if (!table.startsWith('mod_' + moduloId + '_')) throw new Error('Tabla de módulo fuera de prefijo permitido.');
        await this.conn().execute('DROP TABLE IF EXISTS "' + table.replace(/"/g, '""') + '";', false);
      }
      await this.conn().run('DELETE FROM modulos_migraciones WHERE modulo_id = ?;', [moduloId], false);
      await this.conn().commitTransaction();
      await this.persist();
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch {}
      throw error;
    }
  }

  async crearContextoModulo(moduloId: string) {
    const prefijo = 'mod_' + moduloId + '_';
    if (!/^[a-z0-9_]+$/.test(moduloId)) throw new Error('ID de módulo inválido.');
    const validarSql = (sql: string) => {
      const tablas = sql.match(/(?:FROM|JOIN|INTO|UPDATE|TABLE|INDEX|TRIGGER)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi) ?? [];
      for (const item of tablas) {
        const nombre = item.trim().split(/\s+/).pop() ?? '';
        if (nombre && !nombre.toLowerCase().startsWith(prefijo)) throw new Error('El módulo solo puede tocar tablas con prefijo ' + prefijo);
      }
      if (/\b(?:clientes|ventas|pagos|gastos|rutas|configuracion_app|sqlite_master)\b/i.test(sql)) throw new Error('El módulo no puede consultar tablas del núcleo directamente.');
    };
    return {
      leer: async (operacion: 'clientes_activos' | 'ventas_periodo', parametros: unknown[] = []) => {
        if (operacion === 'clientes_activos') {
          const r = await this.conn().query("SELECT COUNT(*) AS total FROM clientes WHERE estado='activo';");
          return Number(r.values?.[0]?.total ?? 0);
        }
        const desde = String(parametros[0] ?? '');
        const hasta = String(parametros[1] ?? '');
        const r = await this.conn().query('SELECT COALESCE(SUM(total),0) AS ventas, COALESCE(SUM(cantidad),0) AS paquetes FROM ventas WHERE fecha BETWEEN ? AND ? AND COALESCE(estado_registro,\'activa\')=\'activa\';', [desde, hasta]);
        return r.values?.[0] ?? { ventas: 0, paquetes: 0 };
      },
      consultarPropio: async <T = Record<string, unknown>>(sql: string, parametros: unknown[] = []): Promise<T[]> => {
        validarSql(sql);
        const r = await this.conn().query(sql, parametros);
        return (r.values ?? []) as T[];
      },
      ejecutarPropio: async (sql: string, parametros: unknown[] = []): Promise<void> => {
        validarSql(sql);
        await this.conn().run(sql, parametros, false);
        await this.persist();
      },
      migracion: async (version: number, trabajo: () => Promise<void>): Promise<void> => {
        const previa = await this.conn().query('SELECT 1 FROM modulos_migraciones WHERE modulo_id=? AND version=?;', [moduloId, version]);
        if (previa.values?.length) return;
        const snapshot = await this.conn().exportToJson('full');
        if (!snapshot.export) throw new Error('No se pudo crear snapshot del módulo.');
        await this.conn().beginTransaction();
        try {
          await trabajo();
          await this.conn().run('INSERT INTO modulos_migraciones (modulo_id,version,aplicada_at) VALUES (?,?,?);', [moduloId,version,new Date().toISOString()], false);
          await this.conn().commitTransaction();
          await this.persist();
        } catch (error) {
          try { await this.conn().rollbackTransaction(); } catch {}
          await this.conn().execute('PRAGMA foreign_keys = ON;', false);
          throw error;
        }
      },
    };
  }

  private async migrarVersion12(): Promise<void> {
    const add = async (table: string, column: string, ddl: string) => {
      const columns = await this.columnasDeTabla(table);
      if (!columns.has(column)) await this.conn().execute('ALTER TABLE ' + table + ' ADD COLUMN ' + ddl + ';');
    };
    await add('ventas', 'estado_registro', "estado_registro TEXT NOT NULL DEFAULT 'activa'");
    await add('ventas', 'motivo_anulacion', 'motivo_anulacion TEXT');
    await add('ventas', 'anulada_at', 'anulada_at TEXT');
    await add('pagos', 'estado_registro', "estado_registro TEXT NOT NULL DEFAULT 'activa'");
    await add('pagos', 'motivo_anulacion', 'motivo_anulacion TEXT');
    await add('pagos', 'anulada_at', 'anulada_at TEXT');
    await add('gastos', 'motivo_anulacion', 'motivo_anulacion TEXT');
    await add('gastos', 'anulado_at', 'anulado_at TEXT');
    await this.conn().execute("UPDATE ventas SET estado_registro='activa' WHERE estado_registro IS NULL OR estado_registro='';", false);
    await this.conn().execute("UPDATE pagos SET estado_registro='activa' WHERE estado_registro IS NULL OR estado_registro='';", false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_ventas_estado_registro ON ventas(estado_registro);', false);
    await this.conn().execute('CREATE INDEX IF NOT EXISTS idx_pagos_estado_registro ON pagos(estado_registro);', false);
  }

  async anularVenta(id: number, motivo: string): Promise<void> {
    const m = textoObligatorio(motivo, 'El motivo de anulación').slice(0, 300);
    const fecha = new Date().toISOString();
    await this.conn().beginTransaction();
    try {
      const venta = await this.conn().query("SELECT estado_registro FROM ventas WHERE id=?;", [id]);
      if (!venta.values?.length) throw new Error('La venta no existe.');
      if (String(venta.values[0].estado_registro ?? 'activa') === 'anulada') return;
      await this.conn().run(
        "UPDATE pagos SET estado_registro='anulada', motivo_anulacion=?, anulada_at=? WHERE venta_id=? AND COALESCE(estado_registro,'activa')='activa';",
        [m, fecha, id],
        false,
      );
      await this.conn().run(
        "UPDATE ventas SET estado_registro='anulada', motivo_anulacion=?, anulada_at=? WHERE id=?;",
        [m, fecha, id],
        false,
      );
      await this.conn().commitTransaction();
      await this.persist();
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch {}
      throw error;
    }
  }

  async anularPago(id: number, motivo: string): Promise<void> {
    const m = textoObligatorio(motivo, 'El motivo de anulación').slice(0, 300);
    const fecha = new Date().toISOString();
    await this.conn().beginTransaction();
    try {
      const r = await this.conn().query("SELECT venta_id, monto, estado_registro FROM pagos WHERE id=?;", [id]);
      const row = r.values?.[0];
      if (!row) throw new Error('El pago no existe.');
      if (String(row.estado_registro ?? 'activa') === 'anulada') return;
      await this.conn().run("UPDATE pagos SET estado_registro='anulada', motivo_anulacion=?, anulada_at=? WHERE id=?;", [m, fecha, id], false);
      const venta = await this.conn().query("SELECT total, monto_pagado FROM ventas WHERE id=?;", [Number(row.venta_id)]);
      const v = venta.values?.[0];
      if (v) {
        const nuevo = Math.max(0, Number(v.monto_pagado ?? 0) - Number(row.monto));
        await this.conn().run(
          "UPDATE ventas SET monto_pagado=?, estado_pago=?, fecha_pago=? WHERE id=? AND estado_registro='activa';",
          [nuevo, nuevo >= Number(v.total) ? 'PAGADA' : 'PENDIENTE', nuevo >= Number(v.total) ? fechaLocalISO() : null, Number(row.venta_id)],
          false,
        );
      }
      await this.conn().commitTransaction();
      await this.persist();
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch {}
      throw error;
    }
  }

  async anularGastoConMotivo(id: number, motivo: string): Promise<void> {
    const m=textoObligatorio(motivo,'El motivo de anulación').slice(0,300);
    await this.conn().run("UPDATE gastos SET estado='anulado', motivo_anulacion=?, anulado_at=?, updated_at=? WHERE id=?;",[m,new Date().toISOString(),new Date().toISOString(),id]);
    await this.persist();
  }

  async verificarSalud(): Promise<void> {
    const fk = await this.conn().query('PRAGMA foreign_key_check;');
    if ((fk.values ?? []).length) throw new Error('foreign_key_check encontró registros inválidos.');
    const integrity = await this.conn().query('PRAGMA integrity_check;');
    const resultado = String(integrity.values?.[0]?.integrity_check ?? integrity.values?.[0]?.[0] ?? '');
    if (resultado.toLowerCase() !== 'ok') throw new Error('integrity_check = ' + resultado);
  }

  private async verificarEsquemaCompleto(): Promise<void> {
    const tablasRequeridas = ['clientes', 'mascotas', 'productos', 'rutas', 'ventas', 'configuracion_app', 'fotos', 'pagos', 'seguimiento_clientes', 'borradores', 'categorias_gasto', 'gastos', 'gastos_recurrentes'];
    const nombres = tablasRequeridas.map((nombre) => "'" + nombre + "'").join(', ');
    const r = await this.conn().query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" + nombres + ');');
    const existentes = new Set((r.values ?? []).map((row) => String(row.name)));
    const faltantes = tablasRequeridas.filter((nombre) => !existentes.has(nombre));
    if (faltantes.length) throw new Error('La base de datos no quedó lista: faltan tablas (' + faltantes.join(', ') + ').');
    const fk = await this.conn().query('PRAGMA foreign_keys;');
    if (Number(fk.values?.[0]?.foreign_keys ?? 0) !== 1) await this.conn().execute('PRAGMA foreign_keys = ON;');
    const referenciasTemporales = await this.conn().query("SELECT name FROM sqlite_master WHERE sql IS NOT NULL AND sql LIKE '%\\_migracion\\_%' ESCAPE '\\';");
    if ((referenciasTemporales.values ?? []).length) throw new Error('La base de datos contiene referencias a tablas temporales de migración.');
    const integridad = await this.conn().query('PRAGMA integrity_check;');
    const resultadoIntegridad = String(integridad.values?.[0]?.integrity_check ?? integridad.values?.[0]?.[0] ?? '');
    if (resultadoIntegridad.toLowerCase() !== 'ok') throw new Error('La base de datos no pasó integrity_check: ' + resultadoIntegridad);;
  }

  private async cerrarConexion(): Promise<void> {
    if (!this.sqlite) return;

    if (this.db) {
      try {
        await this.db.close();
      } catch {
        // Ya estaba cerrada; continuamos con el cierre de la conexión.
      }
    }

    try {
      await this.sqlite.closeConnection(this.activeDbName, false);
    } catch {
      // La conexión puede no existir después de una restauración fallida.
    }

    this.db = null;
    this.activeDbName = DB_NAME;
  }

  private conn(): SQLiteDBConnection {
    if (!this.db) throw new Error('Base de datos no inicializada. Llama a database.init() primero.');
    return this.db;
  }

  private async persist(): Promise<void> {
    if (Capacitor.getPlatform() === 'web' && this.sqlite) {
      await this.sqlite.saveToStore(this.activeDbName);
    }
  }

  private async seedProductosSiVacio(): Promise<void> {
    const r = await this.conn().query('SELECT COUNT(*) as n FROM productos;');
    const n = Number(r.values?.[0]?.n ?? 0);
    if (n === 0) {
      await this.conn().run(
        'INSERT INTO productos (nombre, precio, costo, activo) VALUES (?, ?, ?, 1);',
        ['Galletas carnívoras', 13000, 7000]
      );
    }
  }

  // CLIENTES

  async crearCliente(c: Omit<Cliente, 'id' | 'fecha_registro' | 'estado'> & { fecha_registro?: string }): Promise<number> {
    const nombre = textoObligatorio(c.nombre, 'El nombre');
    if (nombre.length > 120) throw new Error('El nombre supera el límite de 120 caracteres.');
    const telefono1 = textoLimitado(c.telefono1, 'El teléfono 1', 30);
    const telefono2 = textoLimitado(c.telefono2, 'El teléfono 2', 30);
    const observaciones = textoLimitado(c.observaciones, 'Las observaciones', 1000);
    if (!coordenadaValida(c.lat, -90, 90) || !coordenadaValida(c.lng, -180, 180)) {
      throw new Error('La ubicación del cliente no es válida.');
    }
    if ((c.lat == null) !== (c.lng == null)) {
      throw new Error('La latitud y longitud deben venir juntas.');
    }

    validarMesDia(c.cumple_mes, c.cumple_dia, 'Cumpleaños');
    await this.comprobarTelefonoDuplicado(c.telefono1);
    const fecha = c.fecha_registro ?? fechaLocalISO();
    const res = await this.conn().run(
      `INSERT INTO clientes (nombre, telefono1, telefono2, cumple_dia, cumple_mes, fecha_registro, lat, lng, observaciones, nombre_normalizado, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [
        nombre,
        telefono1,
        telefono2,
        c.cumple_dia ?? null,
        c.cumple_mes ?? null,
        fecha,
        c.lat ?? null,
        c.lng ?? null,
        observaciones,
        normalizarTextoBusqueda(nombre),
      ]
    );
    await this.persist();
    return Number(res.changes?.lastId ?? 0);
  }

  private async comprobarTelefonoDuplicado(telefono?: string, excluirClienteId?: number): Promise<void> {
    const normalizado = normalizarTelefono(telefono);
    if (!normalizado) return;
    const r = await this.conn().query("SELECT id, telefono1, telefono2 FROM clientes WHERE estado = 'activo';");
    for (const row of r.values ?? []) {
      const id = Number(row.id);
      if (excluirClienteId != null && id === excluirClienteId) continue;
      const telefono1 = normalizarTelefono(row.telefono1 ? String(row.telefono1) : undefined);
      const telefono2 = normalizarTelefono(row.telefono2 ? String(row.telefono2) : undefined);
      if (telefono1 === normalizado || telefono2 === normalizado) {
        throw new Error('Ese teléfono ya está registrado en otro cliente.');
      }
    }
  }

  async crearClienteConMascotas(
    c: Omit<Cliente, 'id' | 'fecha_registro' | 'estado'> & { fecha_registro?: string },
    mascotas: Array<Omit<Mascota, 'id' | 'estado'>>,
  ): Promise<number> {
    const nombre = textoObligatorio(c.nombre, 'El nombre');
    validarMesDia(c.cumple_mes, c.cumple_dia, 'Cumpleaños');
    await this.comprobarTelefonoDuplicado(c.telefono1);
    if (!coordenadaValida(c.lat, -90, 90) || !coordenadaValida(c.lng, -180, 180)) throw new Error('La ubicación del cliente no es válida.');
    if ((c.lat == null) !== (c.lng == null)) throw new Error('La latitud y longitud deben venir juntas.');
    const fecha = c.fecha_registro ?? fechaLocalISO();
    for (const mascota of mascotas) {
      const mascotaNombre = textoObligatorio(mascota.nombre, 'El nombre de la mascota');
      if (mascotaNombre.length > 80) throw new Error('El nombre de la mascota supera 80 caracteres.');
      if ((mascota.raza ?? '').length > 80) throw new Error('La raza supera 80 caracteres.');
      if ((mascota.preferencias ?? '').length > 500) throw new Error('Las preferencias superan 500 caracteres.');
      if ((mascota.observaciones ?? '').length > 1000) throw new Error('Las observaciones de la mascota superan 1000 caracteres.');
      validarMesDia(mascota.cumple_mes, mascota.cumple_dia, 'Cumpleaños de la mascota');
    }

    await this.conn().beginTransaction();
    try {
        const res = await this.conn().run(
        "INSERT INTO clientes (nombre, telefono1, telefono2, cumple_dia, cumple_mes, fecha_registro, lat, lng, ubicacion_precision_m, ubicacion_fuente, ubicacion_fecha, observaciones, nombre_normalizado, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');",
        [nombre, c.telefono1?.trim() || null, c.telefono2?.trim() || null, c.cumple_dia ?? null, c.cumple_mes ?? null, fecha, c.lat ?? null, c.lng ?? null, c.ubicacion_precision_m ?? null, c.ubicacion_fuente ?? null, c.ubicacion_fecha ?? null, c.observaciones?.trim() || null, normalizarTextoBusqueda(nombre)],
        false
      );
      const clienteId = Number(res.changes?.lastId ?? 0);
      for (const mascota of mascotas) {
        await this.conn().run(
          "INSERT INTO mascotas (cliente_id, nombre, cumple_dia, cumple_mes, sexo, raza, tamano, preferencias, observaciones, nombre_normalizado, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');",
          [clienteId, mascota.nombre.trim(), mascota.cumple_dia ?? null, mascota.cumple_mes ?? null, mascota.sexo ?? null, mascota.raza?.trim() || null, mascota.tamano ?? null, mascota.preferencias?.trim() || null, mascota.observaciones?.trim() || null, normalizarTextoBusqueda(mascota.nombre)],
          false
        );
      }
      await this.conn().commitTransaction();
      await this.persist();
      return clienteId;
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch { /* La transacción ya puede haberse revertido. */ }
      throw error;
    }
  }

  async listarFotosCliente(clienteId: number): Promise<Foto[]> {
    const r = await this.conn().query(
      'SELECT id, cliente_id, categoria, referencia, data_url, creado_at FROM fotos WHERE cliente_id = ? ORDER BY id ASC;',
      [clienteId],
    );
    return (r.values ?? []).map((row) => ({
      id: Number(row.id),
      cliente_id: Number(row.cliente_id),
      categoria: String(row.categoria) as CategoriaFoto,
      referencia: row.referencia ? String(row.referencia) : undefined,
      data_url: String(row.data_url),
      creado_at: String(row.creado_at),
    }));
  }

  async guardarFotosCliente(
    clienteId: number,
    fotos: Array<{ categoria: CategoriaFoto; referencia?: string; data_url: string }>,
  ): Promise<void> {
    if (!Number.isInteger(clienteId) || clienteId <= 0) throw new Error('Cliente inválido.');
    await this.conn().beginTransaction();
    try {
      for (const foto of fotos) {
        if (!/^data:image\/(jpeg|webp|png);base64,/.test(foto.data_url)) {
          throw new Error('Una foto no tiene un formato de imagen válido.');
        }
        await this.conn().run(
          'INSERT INTO fotos (cliente_id, categoria, referencia, data_url, creado_at) VALUES (?, ?, ?, ?, ?);',
          [clienteId, foto.categoria, foto.referencia?.trim() || null, foto.data_url, new Date().toISOString()],
          false,
        );
      }
      await this.conn().commitTransaction();
      await this.persist();
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch {}
      throw error;
    }
  }

  async actualizarFotoCliente(fotoId: number, data_url: string): Promise<void> {
    if (!Number.isInteger(fotoId) || fotoId <= 0) throw new Error('Foto inválida.');
    if (!/^data:image\/(jpeg|webp|png);base64,/.test(data_url)) throw new Error('Formato de imagen no válido.');
    const res = await this.conn().run('UPDATE fotos SET data_url = ? WHERE id = ?;', [data_url, fotoId]);
    if (!res.changes?.changes) throw new Error('La foto no existe.');
    await this.persist();
  }

  async eliminarFotoCliente(fotoId: number): Promise<void> {
    if (!Number.isInteger(fotoId) || fotoId <= 0) throw new Error('Foto inválida.');
    await this.conn().run('DELETE FROM fotos WHERE id = ?;', [fotoId]);
    await this.persist();
  }

  async actualizarCliente(id: number, c: Partial<Cliente>): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Cliente inválido.');
    validarMesDia(c.cumple_mes, c.cumple_dia, 'Cumpleaños');
    if (c.telefono1 !== undefined) await this.comprobarTelefonoDuplicado(c.telefono1, id);

    const cambios = { ...c } as Record<string, unknown>;
    if (typeof cambios.nombre === 'string') cambios.nombre_normalizado = normalizarTextoBusqueda(cambios.nombre);
    const campos = Object.keys(cambios).filter((k) => k !== 'id' && (CAMPOS_CLIENTE_EDITABLES.has(k) || k === 'nombre_normalizado'));
    if (campos.length === 0) return;

    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => cambios[k] ?? null);
    const res = await this.conn().run(`UPDATE clientes SET ${sets} WHERE id = ?;`, [...valores, id]);

    if (!res.changes?.changes) throw new Error('El cliente no existe.');
    await this.persist();
  }

  async archivarCliente(id: number): Promise<void> {
    await this.conn().run(`UPDATE clientes SET estado = 'archivado' WHERE id = ?;`, [id]);
    await this.persist();
  }

  async listarClientes(opts?: { soloActivos?: boolean; texto?: string; limite?: number; offset?: number }): Promise<ClienteConResumen[]> {
    let sql = 'SELECT * FROM clientes';
    const cond: string[] = [];
    const params: unknown[] = [];
    const limite = Math.min(100, Math.max(1, Math.floor(opts?.limite ?? 100)));
    const offset = Math.max(0, Math.floor(opts?.offset ?? 0));

    if (opts?.soloActivos) cond.push(`estado = 'activo'`);
    if (opts?.texto?.trim()) {
      const texto = normalizarTextoBusqueda(opts.texto);
      const glob = escaparGlob(texto) + '*';
      cond.push(`(nombre_normalizado GLOB ? OR telefono1 LIKE ? OR telefono2 LIKE ? OR id IN (SELECT cliente_id FROM mascotas WHERE estado = 'activo' AND nombre_normalizado GLOB ?))`);
      params.push(glob, opts.texto.trim() + '%', opts.texto.trim() + '%', glob);
    }
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY nombre_normalizado ASC, id ASC LIMIT ? OFFSET ?;';
    params.push(limite, offset);

    const r = await this.conn().query(sql, params);
    const clientes = (r.values ?? []) as Cliente[];
    return this.enriquecerClientes(clientes);
  }

  async obtenerCliente(id: number): Promise<ClienteConResumen | null> {
    const r = await this.conn().query('SELECT * FROM clientes WHERE id = ?;', [id]);
    const c = r.values?.[0] as Cliente | undefined;
    return c ? this.enriquecerCliente(c) : null;
  }

  async listarRecordatoriosRecompra(hoy = fechaLocalISO()): Promise<Array<{ id:number; cliente_id:number; nombre:string; telefono1?:string; dias_desde_ultima_compra:number; ritmo_dias:number; pendiente:number; recordar_hasta:string|null }>> {
    const r = await this.conn().query(
      `SELECT c.id AS cliente_id, c.id, c.nombre, c.telefono1, MAX(v.fecha) AS ultima_compra,
              COALESCE(s.dias, 20) AS ritmo_dias,
              COALESCE(SUM(CASE WHEN v.total > COALESCE(v.monto_pagado,0) THEN v.total - COALESCE(v.monto_pagado,0) ELSE 0 END),0) AS pendiente,
              MAX(s.recordar_hasta) AS recordar_hasta
       FROM clientes c
       JOIN ventas v ON v.cliente_id=c.id AND COALESCE(v.estado_registro,'activa')='activa'
       LEFT JOIN seguimiento_clientes s ON s.cliente_id=c.id
       WHERE c.estado='activo'
       GROUP BY c.id, c.nombre, c.telefono1, s.dias, s.recordar_hasta
       HAVING julianday(?) - julianday(MAX(v.fecha)) > COALESCE(s.dias,20)
       ORDER BY (julianday(?) - julianday(MAX(v.fecha))) DESC
       LIMIT 100;`,
      [hoy, hoy],
    );
    return (r.values ?? []).map((row) => {
      const dias = Math.max(0, Math.floor(Number(juliandayDiff(hoy, String(row.ultima_compra ?? hoy)))));
      return { id:Number(row.id), cliente_id:Number(row.cliente_id), nombre:String(row.nombre), telefono1:row.telefono1 ? String(row.telefono1) : undefined, dias_desde_ultima_compra:dias, ritmo_dias:Number(row.ritmo_dias ?? 20), pendiente:Number(row.pendiente ?? 0), recordar_hasta:row.recordar_hasta ? String(row.recordar_hasta) : null };
    });
  }

  private async calcularRitmoAutomatico(clienteId: number): Promise<number> {
    const r = await this.conn().query(
      "SELECT fecha FROM ventas WHERE cliente_id = ? AND COALESCE(estado_registro,'activa')='activa' ORDER BY fecha DESC, hora DESC, id DESC LIMIT 6;",
      [clienteId],
    );
    const fechas = (r.values ?? []).map((row) => String(row.fecha)).filter(Boolean);
    if (fechas.length < 2) return 20;

    let totalGap = 0;
    let gaps = 0;
    for (let i = 0; i < fechas.length - 1; i += 1) {
      const dias = diasEntreISO(fechas[i + 1], fechas[i]);
      if (Number.isFinite(dias) && dias > 0) {
        totalGap += dias;
        gaps += 1;
      }
    }
    return gaps > 0 ? Math.max(1, Math.round(totalGap / gaps)) : 20;
  }

  private async obtenerSeguimientoCliente(clienteId: number): Promise<{
    modo: ModoRitmo;
    dias: number;
    contactado_fecha: string | null;
    recordar_hasta: string | null;
  }> {
    const r = await this.conn().query(
      'SELECT modo, dias, contactado_fecha, recordar_hasta FROM seguimiento_clientes WHERE cliente_id = ?;',
      [clienteId],
    );
    const row = r.values?.[0];
    const modo: ModoRitmo = row?.modo === 'manual' ? 'manual' : 'automatico';
    const dias = modo === 'manual' && Number.isInteger(Number(row?.dias))
      ? Math.max(1, Number(row.dias))
      : await this.calcularRitmoAutomatico(clienteId);
    return {
      modo,
      dias,
      contactado_fecha: row?.contactado_fecha ? String(row.contactado_fecha) : null,
      recordar_hasta: row?.recordar_hasta ? String(row.recordar_hasta) : null,
    };
  }

  private async enriquecerClientes(clientes: Cliente[]): Promise<ClienteConResumen[]> {
    if (!clientes.length) return [];
    const ids = clientes.map((cliente) => cliente.id);
    const placeholders = ids.map(() => '?').join(',');
    const [mascotasResult, ventasResult, seguimientoResult] = await Promise.all([
      this.conn().query('SELECT * FROM mascotas WHERE estado=\'activo\' AND cliente_id IN (' + placeholders + ') ORDER BY nombre_normalizado;', ids),
      this.conn().query(
        `SELECT cliente_id, MIN(fecha) primera, MAX(fecha) ultima, COALESCE(SUM(total),0) total,
                COALESCE(SUM(monto_pagado),0) pagado,
                COALESCE(SUM(CASE WHEN total>COALESCE(monto_pagado,0) THEN total-COALESCE(monto_pagado,0) ELSE 0 END),0) pendiente,
                COALESCE(SUM(cantidad),0) paquetes, COUNT(*) compras,
                COUNT(CASE WHEN total>COALESCE(monto_pagado,0) THEN 1 END) ventas_pendientes
         FROM ventas
         WHERE cliente_id IN (${placeholders}) AND COALESCE(estado_registro,'activa')='activa'
         GROUP BY cliente_id;`,
        ids,
      ),
      this.conn().query('SELECT cliente_id,modo,dias,contactado_fecha,recordar_hasta FROM seguimiento_clientes WHERE cliente_id IN (' + placeholders + ');', ids),
    ]);
    const mascotasMap = new Map<number,Mascota[]>();
    for (const row of mascotasResult.values ?? []) {
      const mascota=row as unknown as Mascota;
      const list=mascotasMap.get(Number(row.cliente_id))??[];
      list.push(mascota);
      mascotasMap.set(Number(row.cliente_id),list);
    }
    const ventasMap=new Map<number,Record<string,unknown>>();
    for(const row of ventasResult.values??[]) ventasMap.set(Number(row.cliente_id),row as Record<string,unknown>);
    const seguimientoMap=new Map<number,Record<string,unknown>>();
    for(const row of seguimientoResult.values??[]) seguimientoMap.set(Number(row.cliente_id),row as Record<string,unknown>);
    return clientes.map((c)=>{
      const row=ventasMap.get(c.id)??{};
      const seguimiento=seguimientoMap.get(c.id);
      const primera_compra=row.primera?String(row.primera):null;
      const ultima_compra=row.ultima?String(row.ultima):null;
      const numero_compras=Number(row.compras??0);
      const total_comprado=Number(row.total??0);
      const ritmo_modo:ModoRitmo=seguimiento?.modo==='manual'?'manual':'automatico';
      const ritmo_dias=ritmo_modo==='manual'?Math.max(1,Number(seguimiento?.dias??20)):20;
      return {
        ...c,
        mascotas:mascotasMap.get(c.id)??[],
        primera_compra,ultima_compra,
        dias_desde_ultima_compra:ultima_compra?diasDesdeISO(ultima_compra):undefined,
        total_comprado,total_pagado:Number(row.pagado??0),pendiente:Number(row.pendiente??0),
        paquetes_comprados:Number(row.paquetes??0),numero_compras,
        ventas_pendientes:Number(row.ventas_pendientes??0),
        ticket_promedio:numero_compras>0?total_comprado/numero_compras:0,
        seguimiento:this.calcularSeguimiento(ultima_compra),
        ritmo_modo,ritmo_dias,
        contactado_fecha:seguimiento?.contactado_fecha?String(seguimiento.contactado_fecha):null,
        recordar_hasta:seguimiento?.recordar_hasta?String(seguimiento.recordar_hasta):null,
      };
    });
  }

  private async enriquecerCliente(c: Cliente): Promise<ClienteConResumen> {
    const [mascotas, r, seguimiento] = await Promise.all([
      this.listarMascotasPorCliente(c.id),
      this.conn().query(
        `SELECT MIN(fecha) as primera,
                MAX(fecha) as ultima,
                COALESCE(SUM(total),0) as total,
                COALESCE(SUM(monto_pagado),0) as pagado,
                COALESCE(SUM(CASE WHEN total > COALESCE(monto_pagado,0) THEN total - COALESCE(monto_pagado,0) ELSE 0 END),0) as pendiente,
                COALESCE(SUM(cantidad),0) as paquetes,
                COUNT(*) as compras,
                COUNT(CASE WHEN total > COALESCE(monto_pagado,0) THEN 1 END) as ventas_pendientes
         FROM ventas WHERE cliente_id = ? AND COALESCE(estado_registro,'activa')='activa';`,
        [c.id]
      ),
      this.obtenerSeguimientoCliente(c.id),
    ]);

    const row = r.values?.[0] ?? {};
    const primera_compra = row.primera ?? null;
    const ultima_compra = row.ultima ?? null;
    const numero_compras = Number(row.compras ?? 0);
    const total_comprado = Number(row.total ?? 0);

    return {
      ...c,
      mascotas,
      primera_compra,
      ultima_compra,
      dias_desde_ultima_compra: ultima_compra ? diasDesdeISO(ultima_compra) : undefined,
      total_comprado,
      total_pagado: Number(row.pagado ?? 0),
      pendiente: Number(row.pendiente ?? 0),
      paquetes_comprados: Number(row.paquetes ?? 0),
      numero_compras,
      ventas_pendientes: Number(row.ventas_pendientes ?? 0),
      ticket_promedio: numero_compras > 0 ? total_comprado / numero_compras : 0,
      seguimiento: this.calcularSeguimiento(ultima_compra),
      ritmo_modo: seguimiento.modo,
      ritmo_dias: seguimiento.dias,
      contactado_fecha: seguimiento.contactado_fecha,
      recordar_hasta: seguimiento.recordar_hasta,
    };
  }

  async guardarRitmoCliente(
    clienteId: number,
    config: { modo: ModoRitmo; dias?: number | null },
  ): Promise<void> {
    if (!Number.isInteger(clienteId) || clienteId <= 0) throw new Error('Cliente inválido.');
    const dias = config.modo === 'manual' ? Math.max(1, Math.floor(Number(config.dias ?? 20))) : null;
    await this.conn().run(
      `INSERT INTO seguimiento_clientes (cliente_id, modo, dias)
       VALUES (?, ?, ?)
       ON CONFLICT(cliente_id) DO UPDATE SET modo = excluded.modo, dias = excluded.dias;`,
      [clienteId, config.modo, dias],
    );
    await this.persist();
  }

  async registrarContactoCliente(clienteId: number): Promise<void> {
    const hoy = fechaLocalISO();
    await this.conn().run(
      `INSERT INTO seguimiento_clientes (cliente_id, modo, dias, contactado_fecha, recordar_hasta)
       VALUES (?, 'automatico', NULL, ?, NULL)
       ON CONFLICT(cliente_id) DO UPDATE SET contactado_fecha = excluded.contactado_fecha;`,
      [clienteId, hoy],
    );
    await this.persist();
  }

  async recordarClienteEn(clienteId: number, dias: number): Promise<void> {
    const diasValidos = Math.max(1, Math.floor(Number(dias)));
    const recordarHasta = sumarDiasISO(fechaLocalISO(), diasValidos);
    await this.conn().run(
      `INSERT INTO seguimiento_clientes (cliente_id, modo, dias, recordar_hasta)
       VALUES (?, 'automatico', NULL, ?)
       ON CONFLICT(cliente_id) DO UPDATE SET recordar_hasta = excluded.recordar_hasta;`,
      [clienteId, recordarHasta],
    );
    await this.persist();
  }

  private calcularSeguimiento
(ultimaCompraISO: string | null): EstadoSeguimiento {
    if (!ultimaCompraISO) return 'POR_CONTACTAR';
    const dias = diasDesdeISO(ultimaCompraISO);
    if (dias <= UMBRAL_POR_CONTACTAR_DIAS) return 'ACTIVO';
    if (dias <= UMBRAL_INACTIVO_DIAS) return 'POR_CONTACTAR';
    return 'INACTIVO';
  }

  // MASCOTAS

  async crearMascota(m: Omit<Mascota, 'id' | 'estado'>): Promise<number> {
    const nombre = textoObligatorio(m.nombre, 'El nombre de la mascota');
    if (nombre.length > 80) throw new Error('El nombre de la mascota supera 80 caracteres.');
    if ((m.raza ?? '').length > 80) throw new Error('La raza supera 80 caracteres.');
    if ((m.preferencias ?? '').length > 500) throw new Error('Las preferencias superan 500 caracteres.');
    if ((m.observaciones ?? '').length > 1000) throw new Error('Las observaciones de la mascota superan 1000 caracteres.');
    const res = await this.conn().run(
      `INSERT INTO mascotas (cliente_id, nombre, cumple_dia, cumple_mes, sexo, raza, tamano, preferencias, observaciones, nombre_normalizado, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [
        m.cliente_id,
        nombre,
        m.cumple_dia ?? null,
        m.cumple_mes ?? null,
        m.sexo ?? null,
        m.raza?.trim() || null,
        m.tamano ?? null,
        m.preferencias?.trim() || null,
        m.observaciones?.trim() || null,
        normalizarTextoBusqueda(nombre),
      ]
    );
    await this.persist();
    return Number(res.changes?.lastId ?? 0);
  }

  async listarMascotasPorCliente(clienteId: number): Promise<Mascota[]> {
    const r = await this.conn().query(
      `SELECT * FROM mascotas WHERE cliente_id = ? AND estado = 'activo' ORDER BY nombre;`,
      [clienteId]
    );
    return (r.values ?? []) as Mascota[];
  }

  async actualizarMascota(id: number, m: Partial<Mascota>): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Mascota inválida.');
    validarMesDia(m.cumple_mes, m.cumple_dia, 'Cumpleaños de la mascota');
    const camposPermitidos = new Set(['nombre', 'cumple_dia', 'cumple_mes', 'sexo', 'raza', 'tamano', 'preferencias', 'observaciones']);
    const cambios = { ...m } as Record<string, unknown>;
    if (m.nombre !== undefined) {
      textoObligatorio(m.nombre, 'El nombre de la mascota');
      if (m.nombre.length > 80) throw new Error('El nombre de la mascota supera 80 caracteres.');
      cambios.nombre_normalizado = normalizarTextoBusqueda(m.nombre);
    }
    const campos = Object.keys(cambios).filter((k) => camposPermitidos.has(k) || k === 'nombre_normalizado');
    if (!campos.length) return;
    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => cambios[k] ?? null);
    const res = await this.conn().run(`UPDATE mascotas SET ${sets} WHERE id = ? AND estado = 'activo';`, [...valores, id]);
    if (!res.changes?.changes) throw new Error('La mascota no existe o está archivada.');
    await this.persist();
  }

  async transferirMascota(id: number, nuevoClienteId: number): Promise<void> {
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(nuevoClienteId) || nuevoClienteId <= 0) throw new Error('Mascota o cliente inválido.');
    const cliente = await this.conn().query("SELECT id FROM clientes WHERE id = ? AND estado = 'activo';", [nuevoClienteId]);
    if (!cliente.values?.length) throw new Error('El nuevo dueño no existe o está archivado.');
    const res = await this.conn().run("UPDATE mascotas SET cliente_id = ? WHERE id = ? AND estado = 'activo';", [nuevoClienteId, id]);
    if (!res.changes?.changes) throw new Error('La mascota no existe o está archivada.');
    await this.persist();
  }

  async archivarMascota(id: number): Promise<void> {
    const res = await this.conn().run("UPDATE mascotas SET estado = 'archivado' WHERE id = ? AND estado = 'activo';", [id]);
    if (!res.changes?.changes) throw new Error('La mascota no existe o ya está archivada.');
    await this.persist();
  }

  async listarMascotasTodas(opts?: { texto?: string }): Promise<MascotaConCliente[]> {
    let sql = "SELECT m.*, c.nombre as cliente_nombre FROM mascotas m JOIN clientes c ON c.id = m.cliente_id WHERE m.estado = 'activo' AND c.estado = 'activo'";
    const params: unknown[] = [];
    if (opts?.texto?.trim()) {
      sql += ' AND (m.nombre_normalizado LIKE ? OR c.nombre_normalizado LIKE ?)';
      const t = normalizarTextoBusqueda(opts.texto);
      params.push('%' + t + '%', '%' + t + '%');
    }
    sql += ' ORDER BY m.nombre ASC;';
    const r = await this.conn().query(sql, params);
    return (r.values ?? []) as MascotaConCliente[];
  }

  // PRODUCTOS

  async listarProductos(opts?: { incluirInactivos?: boolean }): Promise<Producto[]> {
    const r = await this.conn().query(opts?.incluirInactivos ? 'SELECT * FROM productos ORDER BY activo DESC, nombre;' : 'SELECT * FROM productos WHERE activo = 1 ORDER BY nombre;');
    return (r.values ?? []) as Producto[];
  }

  async actualizarProducto(id: number, p: Partial<Omit<Producto, 'id'>>): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Producto inválido.');
    if (p.nombre !== undefined) {
      const nombreProducto = textoObligatorio(p.nombre, 'El nombre del producto');
      if (nombreProducto.length > 120) throw new Error('El nombre del producto supera 120 caracteres.');
    }
    if (p.precio !== undefined) numeroNoNegativo(p.precio, 'El precio');
    if (p.costo !== undefined) numeroNoNegativo(p.costo, 'El costo');
    const campos = Object.keys(p).filter((k) => ['nombre', 'precio', 'costo'].includes(k));
    if (!campos.length) return;
    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => (p as Record<string, unknown>)[k] ?? null);
    const res = await this.conn().run(`UPDATE productos SET ${sets} WHERE id = ?;`, [...valores, id]);
    if (!res.changes?.changes) throw new Error('El producto no existe.');
    await this.persist();
  }

  async archivarProducto(id: number): Promise<void> {
    const res = await this.conn().run("UPDATE productos SET activo = 0 WHERE id = ? AND activo = 1;", [id]);
    if (!res.changes?.changes) throw new Error('El producto no existe o ya está archivado.');
    await this.persist();
  }

  async crearProducto(p: Omit<Producto, 'id' | 'activo'>): Promise<number> {
    const nombre = textoObligatorio(p.nombre, 'El nombre del producto');
    numeroNoNegativo(p.precio, 'El precio');
    numeroNoNegativo(p.costo, 'El costo');

    const res = await this.conn().run(
      'INSERT INTO productos (nombre, precio, costo, activo) VALUES (?, ?, ?, 1);',
      [nombre, p.precio, p.costo]
    );
    await this.persist();
    return Number(res.changes?.lastId ?? 0);
  }

  // RUTAS

  async iniciarRuta(r: { nombre?: string; tipo: Ruta['tipo']; paquetes_llevados: number; lat_inicio?: number; lng_inicio?: number; notas?: string }): Promise<number> {
    const paquetes = enteroPositivo(r.paquetes_llevados, 'Los paquetes llevados');

    const activa = await this.obtenerRutaActiva();
    if (activa) throw new Error('Ya existe una ruta en curso.');

    if (!coordenadaValida(r.lat_inicio, -90, 90) || !coordenadaValida(r.lng_inicio, -180, 180)) {
      throw new Error('La ubicación de inicio no es válida.');
    }

    const ahora = new Date();
    const res = await this.conn().run(
      `INSERT INTO rutas (nombre, tipo, estado, fecha, hora_inicio, lat_inicio, lng_inicio, paquetes_llevados, paquetes_sobrantes, notas)
       VALUES (?, ?, 'EN_CURSO', ?, ?, ?, ?, ?, 0, ?);`,
      [
        r.nombre?.trim() || r.tipo,
        r.tipo,
        fechaLocalISO(ahora),
        horaLocalHHMM(ahora),
        r.lat_inicio ?? null,
        r.lng_inicio ?? null,
        paquetes,
        r.notas?.trim() || null,
      ]
    );
    await this.persist();
    return Number(res.changes?.lastId ?? 0);
  }

  async finalizarRuta(
    id: number,
    fin?: { lat_fin?: number; lng_fin?: number; paquetes_sobrantes?: number },
  ): Promise<void> {
    if (!coordenadaValida(fin?.lat_fin, -90, 90) || !coordenadaValida(fin?.lng_fin, -180, 180)) {
      throw new Error('La ubicación de cierre no es válida.');
    }
    const sobrantes = Math.max(0, Math.floor(Number(fin?.paquetes_sobrantes ?? 0)));
    const actual = await this.conn().query(
      'SELECT estado, paquetes_llevados, COALESCE((SELECT SUM(cantidad) FROM ventas WHERE ruta_id = rutas.id),0) as vendidos FROM rutas WHERE id = ?;',
      [id],
    );
    const row = actual.values?.[0];
    if (!row) throw new Error('La ruta no existe.');
    if (row.estado !== 'EN_CURSO') throw new Error('Solo se puede finalizar una ruta que está en curso.');
    const llevados = Number(row.paquetes_llevados ?? 0);
    const vendidos = Number(row.vendidos ?? 0);
    if (sobrantes > llevados - vendidos) throw new Error('Los sobrantes no pueden superar los paquetes disponibles.');
    if (llevados - vendidos - sobrantes !== 0) {
      throw new Error('El cuadre no cierra: llevados - vendidos - sobrantes debe ser 0.');
    }

    const ahora = new Date();
    await this.conn().run(
      `UPDATE rutas
       SET estado = 'FINALIZADA', paquetes_sobrantes = ?, hora_fin = ?, lat_fin = ?, lng_fin = ?
       WHERE id = ? AND estado = 'EN_CURSO';`,
      [sobrantes, horaLocalHHMM(ahora), fin?.lat_fin ?? null, fin?.lng_fin ?? null, id],
    );
    await this.persist();
  }

  async cancelarRuta(id: number): Promise<void> {
    await this.conn().run(`UPDATE rutas SET estado = 'CANCELADA' WHERE id = ? AND estado = 'EN_CURSO';`, [id]);
    await this.persist();
  }

  async obtenerRutaActiva(): Promise<Ruta | null> {
    const r = await this.conn().query(`SELECT * FROM rutas WHERE estado = 'EN_CURSO' ORDER BY id DESC LIMIT 1;`);
    return (r.values?.[0] as Ruta) ?? null;
  }

  async listarRutas(): Promise<RutaConResumen[]> {
    const r = await this.conn().query('SELECT * FROM rutas ORDER BY id DESC;');
    const rutas = (r.values ?? []) as Ruta[];
    return Promise.all(rutas.map((ruta) => this.resumenRuta(ruta)));
  }

  async resumenRuta(ruta: Ruta): Promise<RutaConResumen> {
    const r = await this.conn().query(
      `SELECT COALESCE(SUM(v.cantidad),0) as vendidos,
              COALESCE(SUM(v.total),0) as total_vendido,
              COALESCE(SUM(v.costo_aplicado * v.cantidad),0) as costos,
              COALESCE(SUM(v.utilidad),0) as utilidad,
              COALESCE(SUM(CASE WHEN v.total > COALESCE(v.monto_pagado,0) THEN v.total - COALESCE(v.monto_pagado,0) ELSE 0 END),0) as total_pendiente,
              COALESCE(SUM(v.monto_pagado),0) as cobrado,
              COUNT(v.id) as numero_ventas,
              COUNT(DISTINCT v.cliente_id) as clientes,
              COUNT(DISTINCT CASE WHEN c.fecha_registro = r.fecha THEN c.id END) as clientes_nuevos,
              COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM ventas v2 WHERE v2.cliente_id = v.cliente_id AND COALESCE(v2.estado_registro,'activa')='activa' AND v2.fecha < r.fecha) THEN v.cliente_id END) as clientes_recompran
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       JOIN rutas r ON r.id = v.ruta_id
       WHERE v.ruta_id = ? AND COALESCE(v.estado_registro,'activa')='activa';`,
      [ruta.id]
    );
    const row = r.values?.[0] ?? {};
    const vendidos = Number(row.vendidos ?? 0);
    const costos = Number(row.costos ?? 0);

    return {
      ...ruta,
      vendidos,
      disponibles: Math.max(ruta.paquetes_llevados - vendidos, 0),
      sobrantes: Math.max(ruta.paquetes_llevados - vendidos, 0),
      total_vendido: Number(row.total_vendido ?? 0),
      total_pendiente: Number(row.total_pendiente ?? 0),
      costos,
      utilidad: Number(row.utilidad ?? 0),
      numero_ventas: Number(row.numero_ventas ?? 0),
      clientes_atendidos: Number(row.clientes ?? 0),
      clientes_nuevos: Number(row.clientes_nuevos ?? 0),
      clientes_recompran: Number(row.clientes_recompran ?? 0),
      cobrado: Number(row.cobrado ?? 0),
      fiado: Number(row.total_pendiente ?? 0),
      ticket_promedio: Number(row.numero_ventas ?? 0) > 0 ? Number(row.total_vendido ?? 0) / Number(row.numero_ventas ?? 0) : 0,
      ventas_por_hora: minutosEntre(ruta.hora_inicio, ruta.hora_fin) && minutosEntre(ruta.hora_inicio, ruta.hora_fin)! > 0
        ? Number(row.numero_ventas ?? 0) / (minutosEntre(ruta.hora_inicio, ruta.hora_fin)! / 60)
        : 0,
      duracion_minutos: minutosEntre(ruta.hora_inicio, ruta.hora_fin),
      gastos_asociados: Number((await this.conn().query("SELECT COALESCE(SUM(monto),0) AS total FROM gastos WHERE ruta_id=? AND estado<>'anulado' AND archivado=0;", [ruta.id])).values?.[0]?.total ?? 0),
      utilidad_neta: Number(row.utilidad ?? 0) - Number((await this.conn().query("SELECT COALESCE(SUM(monto),0) AS total FROM gastos g JOIN categorias_gasto c ON c.id=g.categoria_id WHERE g.ruta_id=? AND g.estado<>'anulado' AND g.archivado=0 AND c.naturaleza='operativo';", [ruta.id])).values?.[0]?.total ?? 0),
    };
  }

  // VENTAS

  async registrarVenta(v: {
    cliente_id: number;
    ruta_id?: number | null;
    producto_nombre: string;
    cantidad: number;
    precio_aplicado: number;
    costo_aplicado: number;
    estado_pago?: 'PAGADA' | 'PENDIENTE';
    metodo_pago?: string;
    monto_pagado?: number;
    operacion_id?: string;
  }): Promise<number> {
    const cantidad = enteroPositivo(v.cantidad, 'La cantidad');
    const precio = numeroNoNegativo(v.precio_aplicado, 'El precio aplicado');
    const costo = numeroNoNegativo(v.costo_aplicado, 'El costo aplicado');
    const productoNombre = textoObligatorio(v.producto_nombre, 'El producto');
    const total = multiplicarDinero(precio, cantidad, 'El total');
    const utilidad = multiplicarDinero(precio - costo, cantidad, 'La utilidad');
    const montoPagado = v.monto_pagado == null ? (v.estado_pago === 'PAGADA' ? total : 0) : numeroNoNegativo(v.monto_pagado, 'El monto pagado');
    if (montoPagado > total) throw new Error('El monto pagado no puede superar el total de la venta.');
    const estado = montoPagado === total ? 'PAGADA' : 'PENDIENTE';
    const estadoRegistro = 'activa';
    const metodo = v.metodo_pago?.trim() || (estado === 'PAGADA' ? 'EFECTIVO' : 'FIADO');
    const operacionId = v.operacion_id?.trim() || null;
    if (operacionId) {
      const existente = await this.conn().query('SELECT id FROM ventas WHERE operacion_id = ?;', [operacionId]);
      if (existente.values?.[0]?.id != null) return Number(existente.values[0].id);
    }
    const cliente = await this.conn().query('SELECT id FROM clientes WHERE id = ? AND estado = \'activo\';', [v.cliente_id]);
    if (!cliente.values?.length) throw new Error('El cliente no existe o está archivado.');
    if (v.ruta_id != null) {
      const ruta = await this.conn().query('SELECT estado, paquetes_llevados FROM rutas WHERE id = ?;', [v.ruta_id]);
      const row = ruta.values?.[0];
      if (!row) throw new Error('La ruta no existe.');
      if (row.estado !== 'EN_CURSO') throw new Error('No se pueden registrar ventas en una ruta que no está en curso.');
      const vendidos = await this.conn().query("SELECT COALESCE(SUM(cantidad), 0) as n FROM ventas WHERE ruta_id = ? AND COALESCE(estado_registro,'activa')='activa';", [v.ruta_id]);
      const yaVendidos = Number(vendidos.values?.[0]?.n ?? 0);
      const llevados = Number(row.paquetes_llevados ?? 0);
      if (yaVendidos + cantidad > llevados) throw new Error('No hay suficientes paquetes disponibles en la ruta. Disponibles: ' + Math.max(llevados - yaVendidos, 0) + '.');
    }
    const ahora = new Date();
    await this.conn().beginTransaction();
    try {
      const res = await this.conn().run(`INSERT INTO ventas (cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago, metodo_pago, monto_pagado, operacion_id, estado_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, [v.cliente_id, v.ruta_id ?? null, productoNombre, cantidad, precio, costo, total, utilidad, fechaLocalISO(ahora), horaLocalHHMM(ahora), estado, estado === 'PAGADA' ? fechaLocalISO(ahora) : null, metodo, montoPagado, operacionId, estadoRegistro], false);
      await this.conn().commitTransaction();
      await this.persist();
      return Number(res.changes?.lastId ?? 0);
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch { /* La transacción ya puede haberse revertido. */ }
      if (operacionId) {
        const existente = await this.conn().query('SELECT id FROM ventas WHERE operacion_id = ?;', [operacionId]);
        if (existente.values?.[0]?.id != null) return Number(existente.values[0].id);
      }
      throw error;
    }
  }

  async listarPagosCliente(clienteId: number): Promise<Pago[]> {
    if (!Number.isInteger(clienteId) || clienteId <= 0) throw new Error('Cliente inválido.');
    const r = await this.conn().query(
      `SELECT * FROM pagos
       WHERE cliente_id = ?
       ORDER BY fecha DESC, hora DESC, id DESC;`,
      [clienteId],
    );
    return (r.values ?? []) as Pago[];
  }

  async registrarPagoCliente(
    clienteId: number,
    montoSolicitado: number,
    metodoPago: 'EFECTIVO' | 'TRANSFERENCIA_NEQUI',
    operacionId?: string,
  ): Promise<number> {
    const monto = numeroNoNegativo(montoSolicitado, 'El monto del pago');
    if (monto <= 0) throw new Error('El monto del pago debe ser mayor que 0.');

    const cliente = await this.conn().query(
      "SELECT id FROM clientes WHERE id = ? AND estado = 'activo';",
      [clienteId],
    );
    if (!cliente.values?.length) throw new Error('El cliente no existe o está archivado.');

    const ahora = new Date();
    const op = operacionId?.trim() || null;
    if (op) {
      const previo = await this.conn().query(
        "SELECT COALESCE(SUM(monto),0) as n FROM pagos WHERE operacion_id LIKE ? AND COALESCE(estado_registro,'activa')='activa';",
        [op + '-%'],
      );
      const yaRegistrado = Number(previo.values?.[0]?.n ?? 0);
      if (yaRegistrado > 0) return yaRegistrado;
    }

    const ventas = await this.conn().query(
      `SELECT id, total, COALESCE(monto_pagado,0) as monto_pagado
       FROM ventas
       WHERE cliente_id = ? AND total > COALESCE(monto_pagado,0) AND COALESCE(estado_registro,'activa')='activa'
       ORDER BY fecha ASC, hora ASC, id ASC;`,
      [clienteId],
    );

    let restante = monto;
    let aplicado = 0;

    await this.conn().beginTransaction();
    try {
      for (const row of ventas.values ?? []) {
        if (restante <= 0) break;

        const ventaId = Number(row.id);
        const totalVenta = Number(row.total);
        const pagadoActual = Number(row.monto_pagado ?? 0);
        const saldo = Math.max(totalVenta - pagadoActual, 0);
        const abono = Math.min(saldo, restante);
        if (abono <= 0) continue;

        const pagoOperacion = op ? op + '-' + ventaId : null;
        await this.conn().run(
          'INSERT INTO pagos (venta_id, cliente_id, monto, fecha, hora, metodo_pago, operacion_id) VALUES (?, ?, ?, ?, ?, ?, ?);',
          [
            ventaId,
            clienteId,
            abono,
            fechaLocalISO(ahora),
            horaLocalHHMM(ahora),
            metodoPago,
            pagoOperacion,
          ],
          false,
        );

        const nuevoPagado = pagadoActual + abono;
        await this.conn().run(
          `UPDATE ventas
           SET monto_pagado = ?, estado_pago = ?, fecha_pago = ?, metodo_pago = ?
           WHERE id = ?;`,
          [
            nuevoPagado,
            nuevoPagado >= totalVenta ? 'PAGADA' : 'PENDIENTE',
            fechaLocalISO(ahora),
            metodoPago,
            ventaId,
          ],
          false,
        );

        restante -= abono;
        aplicado += abono;
      }

      if (restante > 0) throw new Error('El pago supera la cartera pendiente del cliente.');
      await this.conn().commitTransaction();
      await this.persist();
      return aplicado;
    } catch (error) {
      try { await this.conn().rollbackTransaction(); } catch { /* La transacción ya puede haberse revertido. */ }
      throw error;
    }
  }

  async marcarVentaPagada(id: number): Promise<void> {
    const venta = await this.conn().query(
      'SELECT cliente_id, total, COALESCE(monto_pagado,0) as monto_pagado FROM ventas WHERE id = ?;',
      [id],
    );
    const row = venta.values?.[0];
    if (!row) throw new Error('La venta no existe.');
    const saldo = Math.max(Number(row.total) - Number(row.monto_pagado ?? 0), 0);
    if (saldo <= 0) return;
    await this.registrarPagoCliente(Number(row.cliente_id), saldo, 'EFECTIVO');
  }

  async listarVentasPorCliente(clienteId: number): Promise<Venta[]> {
    const r = await this.conn().query('SELECT * FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC, hora DESC;', [clienteId]);
    return (r.values ?? []) as Venta[];
  }

  async listarVentasPorRuta(rutaId: number): Promise<Venta[]> {
    const r = await this.conn().query('SELECT * FROM ventas WHERE ruta_id = ? ORDER BY hora DESC;', [rutaId]);
    return (r.values ?? []) as Venta[];
  }

  // INFORMES

  async resumenPeriodo(desde: string, hasta: string): Promise<ResumenPeriodo> {
    const r = await this.conn().query(
      `SELECT COALESCE(SUM(total),0) as ventas,
              COALESCE(SUM(costo_aplicado * cantidad),0) as costos,
              COALESCE(SUM(cantidad),0) as paquetes,
              COALESCE(SUM(utilidad),0) as utilidad,
              COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.fecha BETWEEN ? AND ? AND COALESCE(p.estado_registro,'activa')='activa'),0) as pagado,
              COALESCE(SUM(CASE WHEN total > COALESCE(monto_pagado,0) THEN total - COALESCE(monto_pagado,0) ELSE 0 END),0) as pendiente,
              COUNT(*) as numero_ventas
       FROM ventas WHERE fecha BETWEEN ? AND ? AND COALESCE(estado_registro,'activa')='activa';`,
      [desde, hasta, desde, hasta]
    );
    const row = r.values?.[0] ?? {};

    const rc = await this.conn().query(
      'SELECT COUNT(*) as n FROM clientes WHERE fecha_registro BETWEEN ? AND ?;',
      [desde, hasta]
    );
    const clientes_nuevos = Number(rc.values?.[0]?.n ?? 0);
    const numero_ventas = Number(row.numero_ventas ?? 0);
    const ventas = Number(row.ventas ?? 0);

    const recurrentes = await this.conn().query(
      "SELECT COUNT(*) as n FROM (SELECT cliente_id FROM ventas WHERE fecha BETWEEN ? AND ? AND COALESCE(estado_registro,'activa')='activa' GROUP BY cliente_id HAVING COUNT(*) > 1);",
      [desde, hasta]
    );
    const clientesActivos = await this.conn().query("SELECT COUNT(*) as n FROM clientes WHERE estado = 'activo';");
    const clientesPorContactar = await this.conn().query(
      "SELECT COUNT(*) as n FROM clientes WHERE estado = 'activo' AND id IN (SELECT cliente_id FROM ventas WHERE COALESCE(estado_registro,'activa')='activa' GROUP BY cliente_id HAVING julianday(?) - julianday(MAX(fecha)) > ? AND julianday(?) - julianday(MAX(fecha)) <= ?);",
      [fechaLocalISO(), UMBRAL_POR_CONTACTAR_DIAS, fechaLocalISO(), UMBRAL_INACTIVO_DIAS]
    );
    const rutasRealizadas = await this.conn().query(
      "SELECT COUNT(*) as n FROM rutas WHERE estado = 'FINALIZADA' AND fecha BETWEEN ? AND ?;",
      [desde, hasta]
    );
    const cartera = await this.conn().query("SELECT COALESCE(SUM(total - COALESCE(monto_pagado,0)),0) as n FROM ventas WHERE total > COALESCE(monto_pagado,0) AND COALESCE(estado_registro,'activa')='activa';");

    const gastos = await this.conn().query(
      `SELECT
         COALESCE(SUM(CASE WHEN c.naturaleza='operativo' AND g.estado <> 'anulado' THEN g.monto ELSE 0 END),0) operativo,
         COALESCE(SUM(CASE WHEN g.estado='pendiente' AND g.archivado=0 THEN g.monto ELSE 0 END),0) pendientes,
         COALESCE(SUM(CASE WHEN g.estado='pagado' AND g.archivado=0 THEN g.monto ELSE 0 END),0) pagados
       FROM gastos g JOIN categorias_gasto c ON c.id=g.categoria_id
       WHERE g.periodo >= substr(?,1,7) AND g.fecha BETWEEN ? AND ?;`,
      [hasta, desde, hasta],
    );
    const gr = gastos.values?.[0] ?? {};
    const gastosOperativos = Number(gr.operativo ?? 0);
    const utilidadBruta = Number(row.ventas ?? 0) - Number(row.costos ?? 0);
    return {
      ventas,
      costos: Number(row.costos ?? 0),
      paquetes: Number(row.paquetes ?? 0),
      utilidad: Number(row.utilidad ?? 0),
      pagado: Number(row.pagado ?? 0),
      pendiente: Number(row.pendiente ?? 0),
      clientes_nuevos,
      numero_ventas,
      ticket_promedio: numero_ventas > 0 ? ventas / numero_ventas : 0,
      clientes_recurrentes: Number(recurrentes.values?.[0]?.n ?? 0),
      rutas_realizadas: Number(rutasRealizadas.values?.[0]?.n ?? 0),
      clientes_activos: Number(clientesActivos.values?.[0]?.n ?? 0),
      clientes_por_contactar: Number(clientesPorContactar.values?.[0]?.n ?? 0),
      cartera_pendiente: Number(cartera.values?.[0]?.n ?? 0),
      gastos_operativos: gastosOperativos,
      utilidad_neta: utilidadBruta - gastosOperativos,
      gastos_pendientes: Number(gr.pendientes ?? 0),
    };
  }

  async listarCartera(desde?: string, hasta?: string): Promise<CarteraItem[]> {
    const filtros = ["c.estado = 'activo'", 'v.total > COALESCE(v.monto_pagado,0)'];
    const params: unknown[] = [];
    if (desde && hasta) {
      filtros.push('v.fecha BETWEEN ? AND ?');
      params.push(desde, hasta);
    }
    const r = await this.conn().query(
      `SELECT c.id as cliente_id, c.nombre, c.telefono1,
              COALESCE(SUM(v.total - COALESCE(v.monto_pagado,0)),0) as pendiente,
              COUNT(v.id) as ventas_pendientes
       FROM clientes c
       JOIN ventas v ON v.cliente_id = c.id
       WHERE ${[...filtros, "COALESCE(v.estado_registro,'activa')='activa'"].join(' AND ')}
       GROUP BY c.id, c.nombre, c.telefono1
       ORDER BY pendiente DESC, c.nombre ASC;`,
      params,
    );
    return (r.values ?? []).map((row) => ({
      cliente_id: Number(row.cliente_id),
      nombre: String(row.nombre),
      telefono1: row.telefono1 ? String(row.telefono1) : undefined,
      pendiente: Number(row.pendiente ?? 0),
      ventas_pendientes: Number(row.ventas_pendientes ?? 0),
    }));
  }

  async obtenerSeguridadPin(): Promise<{habilitado:boolean;hash:string|null;salt:string|null;lock_minutos:number}> {
    const r=await this.conn().query("SELECT clave,valor FROM configuracion_app WHERE clave IN ('pin_habilitado','pin_hash','pin_salt','pin_lock_minutos');");
    const m=new Map((r.values??[]).map(row=>[String(row.clave),String(row.valor)]));
    return {habilitado:m.get('pin_habilitado')==='1',hash:m.get('pin_hash')||null,salt:m.get('pin_salt')||null,lock_minutos:Math.max(1,Number(m.get('pin_lock_minutos')??5)||5)};
  }
  async guardarSeguridadPin(data:{habilitado:boolean;hash?:string|null;salt?:string|null;lock_minutos:number}):Promise<void>{
    const pares:Record<string,string>={pin_habilitado:data.habilitado?'1':'0',pin_lock_minutos:String(Math.max(1,Math.floor(data.lock_minutos)))};
    if(data.hash!==undefined)pares.pin_hash=data.hash??''; if(data.salt!==undefined)pares.pin_salt=data.salt??'';
    for(const [clave,valor] of Object.entries(pares)) await this.conn().run('INSERT INTO configuracion_app (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;',[clave,valor]);
    await this.persist();
  }
  async obtenerConfiguracion(): Promise<ConfiguracionApp> {
    const r = await this.conn().query('SELECT clave, valor FROM configuracion_app;');
    const valores = new Map((r.values ?? []).map((row) => [String(row.clave), String(row.valor)]));
    return {
      negocio_nombre: valores.get('negocio_nombre') ?? DEFAULT_CONFIG.negocio_nombre,
      usuario_nombre: valores.get('usuario_nombre') ?? DEFAULT_CONFIG.usuario_nombre,
      color_acento: valores.get('color_acento') ?? DEFAULT_CONFIG.color_acento,
      moneda: 'COP',
      mensaje_recordatorio: valores.get('mensaje_recordatorio') ?? DEFAULT_CONFIG.mensaje_recordatorio,
      privacy_accepted_at: valores.get('privacy_accepted_at') ?? null,
      privacy_responsable: valores.get('privacy_responsable') ?? valores.get('negocio_nombre') ?? '',
    };
  }

  async guardarConfiguracion(config: Partial<ConfiguracionApp>): Promise<void> {
    for (const [clave, valor] of Object.entries(config)) {
      if (valor === undefined || clave === 'moneda') continue;
      await this.conn().run(
        'INSERT INTO configuracion_app (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor;',
        [clave, String(valor)]
      );
    }
    await this.persist();
  }

  async guardarConfiguracionInicial(
    config: Pick<ConfiguracionApp, 'negocio_nombre' | 'usuario_nombre' | 'color_acento'>,
    producto: { nombre: string; precio: number; costo: number },
  ): Promise<void> {
    textoObligatorio(config.negocio_nombre, 'El nombre del negocio');
    textoObligatorio(config.usuario_nombre, 'El nombre del usuario');
    textoObligatorio(producto.nombre, 'El nombre del producto');
    numeroNoNegativo(producto.precio, 'El precio');
    numeroNoNegativo(producto.costo, 'El costo');
    await this.guardarConfiguracion(config);
    const productos = await this.listarProductos({ incluirInactivos: true });
    if (productos[0]) {
      await this.actualizarProducto(productos[0].id, producto);
      if (productos[0].activo !== 1) {
        await this.conn().run('UPDATE productos SET activo = 1 WHERE id = ?;', [productos[0].id]);
        await this.persist();
      }
    } else {
      await this.crearProducto(producto);
    }
  }

  async resumenHoy(): Promise<ResumenPeriodo> {
    const hoy = fechaLocalISO();
    return this.resumenPeriodo(hoy, hoy);
  }

  // RESPALDO

  async exportarRespaldo(): Promise<string> {
    const json = await this.conn().exportToJson('full');
    if (!json.export) throw new Error('SQLite no devolvió un respaldo válido.');
    const modulos = await crearContexto(this).exportarTodo();
    const checksum = await calcularChecksum(JSON.stringify({ data: json.export, modulos }));
    const envelope = {
      camello_backup_version: 1,
      database: DB_NAME,
      schema_version: DB_VERSION,
      exported_at: new Date().toISOString(),
      checksum,
      modulos,
      data: json.export,
    };
    return JSON.stringify(envelope, null, 2);
  }

  async validarRespaldo(jsonTexto: string): Promise<{ version: number; checksum: string | null; exportData: SqliteExportData; modulos: Record<string, unknown> }> {
    const bytes = new TextEncoder().encode(jsonTexto).byteLength;
    if (bytes > 25 * 1024 * 1024) throw new Error('El respaldo supera el límite de 25 MB.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonTexto);
    } catch {
      throw new Error('El archivo no contiene JSON válido.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('El respaldo debe ser un objeto JSON.');
    }
    const data = parsed as Record<string, unknown>;
    if (Number(data.camello_backup_version ?? 0) === 1 && data.data && typeof data.data === 'object') {
      const exportData = data.data as SqliteExportData;
      const checksum = String(data.checksum ?? '');
      const modulos = data.modulos && typeof data.modulos === 'object' && !Array.isArray(data.modulos) ? data.modulos as Record<string, unknown> : {};
      if (!checksum) throw new Error('El respaldo no tiene checksum.');
      const calculado = await calcularChecksum(JSON.stringify(
        data.modulos && typeof data.modulos === 'object'
          ? { data: exportData, modulos: data.modulos }
          : exportData,
      ));
      if (calculado !== checksum) throw new Error('El respaldo fue alterado o está corrupto.');
      const version = Number(data.schema_version);
      if (!Number.isInteger(version) || version < 1 || version > DB_VERSION) {
        throw new Error('Versión de respaldo no compatible.');
      }
      return { version, checksum, exportData, modulos };
    }

    const version = Number(data.version);
    if (!Number.isInteger(version) || version < 1 || version > DB_VERSION) {
      throw new Error('Versión de respaldo no compatible.');
    }
    return { version, checksum: null, exportData: data as SqliteExportData, modulos: {} };
  }

  async importarRespaldo(jsonTexto: string): Promise<void> {
    if (!this.sqlite) throw new Error('SQLite no está inicializado.');
    const valido = await this.validarRespaldo(jsonTexto);
    const data: SqliteExportData = { ...valido.exportData, database: this.activeDbName };

    if (data.database !== DB_NAME && data.database !== DB_NAME + '.db' && data.database !== this.activeDbName) {
      throw new Error('Este respaldo no pertenece a CAMELLO.');
    }
    if (data.mode !== 'full') throw new Error('El respaldo debe ser completo.');
    if (data.encrypted === true) throw new Error('No se admiten respaldos cifrados en esta versión.');
    if (!Array.isArray(data.tables)) throw new Error('El respaldo está incompleto.');

    const serialized = JSON.stringify(data);
    const estructural = await this.sqlite.isJsonValid(serialized);
    if (!estructural.result) throw new Error('El archivo de respaldo no tiene una estructura SQLite válida.');

    const actual = await this.conn().exportToJson('full');
    if (!actual.export) throw new Error('No se pudo crear un respaldo de seguridad antes de restaurar.');
    const actualSerialized = JSON.stringify(actual.export);

    await this.cerrarConexion();

    try {
      await this.sqlite.importFromJson(serialized);
    } catch (error) {
      try {
        await this.abrirConexion();
        await this.sqlite.importFromJson(JSON.stringify({ ...JSON.parse(actualSerialized), database: this.activeDbName, overwrite: true }));
      } catch {
        // Si la restauración de emergencia también falla, propagamos el error original.
      }
      throw error;
    } finally {
      if (!this.db) await this.abrirConexion();
      await this.prepararEsquema();
      await this.seedProductosSiVacio();
      if (Object.keys(valido.modulos).length > 0) {
        const { crearContexto } = await import('../modulos/runtime');
        await crearContexto(this).importarTodo(valido.modulos);
      }
      await this.persist();
    }
  }

  async limpiarAplicacion(respaldoVerificado: string): Promise<void> {
    if (!this.db) throw new Error('SQLite no está inicializado.');
    const valido = await this.validarRespaldo(respaldoVerificado);
    if (!valido.checksum) throw new Error('Para limpiar la aplicación debes usar un respaldo nuevo con checksum.');
    await this.db.delete();
    this.db = null;
    this.activeDbName = DB_NAME;
    await this.abrirConexion();
    await this.prepararEsquema();
    await this.seedProductosSiVacio();
    await this.persist();
  }
}

export const database = new Database();
