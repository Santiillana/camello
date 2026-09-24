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
  FuenteUbicacion,
} from '../types';
import { diasDesdeISO, fechaLocalISO, horaLocalHHMM, sumarDiasISO } from '../utils/format';
import { initWebSqlite } from './initWebSqlite';

const DEFAULT_CONFIG: ConfiguracionApp = {
  negocio_nombre: '',
  usuario_nombre: '',
  color_acento: '#c2642b',
  moneda: 'COP',
  mensaje_recordatorio: 'Hola {nombre}, ¿cómo están? Ya podría ser momento de su próxima compra en COMBOPITT.',
};

function normalizarTelefono(valor?: string): string {
  return (valor ?? '').replace(/\D/g, '');
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
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    if (Capacitor.getPlatform() === 'web') {
      await initWebSqlite();
      await this.sqlite.initWebStore();
    }

    await this.abrirConexion();
    await this.prepararEsquema();
    await this.seedProductosSiVacio();
    await this.persist();
  }

  private async nombreBaseExistente(): Promise<string> {
    if (!this.sqlite) throw new Error('Conexión SQLite no disponible.');

    try {
      const listado = await this.sqlite.getDatabaseList();
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
    const consistency = await this.sqlite.checkConnectionsConsistency();
    const isConn = (await this.sqlite.isConnection(this.activeDbName, false)).result;
    this.db = consistency.result && isConn
      ? await this.sqlite.retrieveConnection(this.activeDbName, false)
      : await this.sqlite.createConnection(this.activeDbName, false, 'no-encryption', DB_VERSION, false);

    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;');
  }

  private async prepararEsquema(): Promise<void> {
    const db = this.conn();
    for (const stmt of SCHEMA_STATEMENTS) await db.execute(stmt);
    const versionResult = await db.query('PRAGMA user_version;');
    const version = Number(versionResult.values?.[0]?.user_version ?? 0);
    if (version > DB_VERSION) throw new Error('La base de datos usa una versión de esquema más nueva (' + version + ') que esta app (' + DB_VERSION + ').');
    const migraciones = [
      { version: 2, ejecutar: () => this.migrarVersion2() },
      { version: 3, ejecutar: () => this.migrarVersion3() },
      { version: 4, ejecutar: () => this.migrarVersion4() },
      { version: 5, ejecutar: () => this.migrarVersion5() },
      { version: 6, ejecutar: () => this.migrarVersion6() },
      { version: 7, ejecutar: () => this.migrarVersion7() },
    ];
    for (const migracion of migraciones) if (version <= migracion.version) await migracion.ejecutar();
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

  private async verificarEsquemaCompleto(): Promise<void> {
    const tablasRequeridas = ['clientes', 'mascotas', 'productos', 'rutas', 'ventas', 'configuracion_app', 'fotos', 'pagos', 'seguimiento_clientes'];
    const nombres = tablasRequeridas.map((nombre) => "'" + nombre + "'").join(', ');
    const r = await this.conn().query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" + nombres + ');');
    const existentes = new Set((r.values ?? []).map((row) => String(row.name)));
    const faltantes = tablasRequeridas.filter((nombre) => !existentes.has(nombre));
    if (faltantes.length) throw new Error('La base de datos no quedó lista: faltan tablas (' + faltantes.join(', ') + ').');
    const fk = await this.conn().query('PRAGMA foreign_keys;');
    if (Number(fk.values?.[0]?.foreign_keys ?? 0) !== 1) await this.conn().execute('PRAGMA foreign_keys = ON;');
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
      `INSERT INTO clientes (nombre, telefono1, telefono2, cumple_dia, cumple_mes, fecha_registro, lat, lng, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [
        nombre,
        c.telefono1?.trim() || null,
        c.telefono2?.trim() || null,
        c.cumple_dia ?? null,
        c.cumple_mes ?? null,
        fecha,
        c.lat ?? null,
        c.lng ?? null,
        c.observaciones?.trim() || null,
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
      textoObligatorio(mascota.nombre, 'El nombre de la mascota');
      validarMesDia(mascota.cumple_mes, mascota.cumple_dia, 'Cumpleaños de la mascota');
    }

    await this.conn().beginTransaction();
    try {
        const res = await this.conn().run(
        "INSERT INTO clientes (nombre, telefono1, telefono2, cumple_dia, cumple_mes, fecha_registro, lat, lng, ubicacion_precision_m, ubicacion_fuente, ubicacion_fecha, observaciones, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');",
        [nombre, c.telefono1?.trim() || null, c.telefono2?.trim() || null, c.cumple_dia ?? null, c.cumple_mes ?? null, fecha, c.lat ?? null, c.lng ?? null, c.ubicacion_precision_m ?? null, c.ubicacion_fuente ?? null, c.ubicacion_fecha ?? null, c.observaciones?.trim() || null],
        false
      );
      const clienteId = Number(res.changes?.lastId ?? 0);
      for (const mascota of mascotas) {
        await this.conn().run(
          "INSERT INTO mascotas (cliente_id, nombre, cumple_dia, cumple_mes, sexo, raza, tamano, preferencias, observaciones, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');",
          [clienteId, mascota.nombre.trim(), mascota.cumple_dia ?? null, mascota.cumple_mes ?? null, mascota.sexo ?? null, mascota.raza?.trim() || null, mascota.tamano ?? null, mascota.preferencias?.trim() || null, mascota.observaciones?.trim() || null],
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

    const campos = Object.keys(c).filter((k) => k !== 'id' && CAMPOS_CLIENTE_EDITABLES.has(k));
    if (campos.length === 0) return;

    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => (c as Record<string, unknown>)[k] ?? null);
    const res = await this.conn().run(`UPDATE clientes SET ${sets} WHERE id = ?;`, [...valores, id]);

    if (!res.changes?.changes) throw new Error('El cliente no existe.');
    await this.persist();
  }

  async archivarCliente(id: number): Promise<void> {
    await this.conn().run(`UPDATE clientes SET estado = 'archivado' WHERE id = ?;`, [id]);
    await this.persist();
  }

  async listarClientes(opts?: { soloActivos?: boolean; texto?: string }): Promise<ClienteConResumen[]> {
    let sql = 'SELECT * FROM clientes';
    const cond: string[] = [];
    const params: unknown[] = [];

    if (opts?.soloActivos) cond.push(`estado = 'activo'`);
    if (opts?.texto?.trim()) {
      const texto = opts.texto.trim();
      cond.push(`(nombre LIKE ? OR telefono1 LIKE ? OR telefono2 LIKE ? OR id IN (SELECT cliente_id FROM mascotas WHERE estado = 'activo' AND nombre LIKE ?))`);
      params.push(`%${texto}%`, `%${texto}%`, `%${texto}%`, `%${texto}%`);
    }

    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY nombre ASC;';

    const r = await this.conn().query(sql, params);
    const clientes = (r.values ?? []) as Cliente[];
    return Promise.all(clientes.map((c) => this.enriquecerCliente(c)));
  }

  async obtenerCliente(id: number): Promise<ClienteConResumen | null> {
    const r = await this.conn().query('SELECT * FROM clientes WHERE id = ?;', [id]);
    const c = r.values?.[0] as Cliente | undefined;
    return c ? this.enriquecerCliente(c) : null;
  }

  private async calcularRitmoAutomatico(clienteId: number): Promise<number> {
    const r = await this.conn().query(
      'SELECT fecha FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC, hora DESC, id DESC LIMIT 6;',
      [clienteId],
    );
    const fechas = (r.values ?? []).map((row) => String(row.fecha)).filter(Boolean);
    if (fechas.length < 2) return 20;

    let totalGap = 0;
    let gaps = 0;
    for (let i = 0; i < fechas.length - 1; i += 1) {
      const dias = Math.abs(diasDesdeISO(fechas[i + 1], new Date(fechas[i])));
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
         FROM ventas WHERE cliente_id = ?;`,
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
    const res = await this.conn().run(
      `INSERT INTO mascotas (cliente_id, nombre, cumple_dia, cumple_mes, sexo, raza, tamano, preferencias, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
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
    const campos = Object.keys(m).filter((k) => camposPermitidos.has(k));
    if (!campos.length) return;
    if (m.nombre !== undefined) textoObligatorio(m.nombre, 'El nombre de la mascota');
    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => (m as Record<string, unknown>)[k] ?? null);
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
      sql += ' AND (m.nombre LIKE ? OR c.nombre LIKE ?)';
      const t = opts.texto.trim();
      params.push(`%${t}%`, `%${t}%`);
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
    if (p.nombre !== undefined) textoObligatorio(p.nombre, 'El nombre del producto');
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

  async crearRuta(r: { nombre: string; tipo: Ruta['tipo']; fecha_planificada: string; hora_planificada?: string; paquetes_llevados: number; notas?: string }): Promise<number> {
    const nombre = textoObligatorio(r.nombre, 'El nombre de la ruta');
    const paquetes = enteroPositivo(r.paquetes_llevados, 'Los paquetes llevados');
    if (!r.fecha_planificada) throw new Error('La fecha planificada es obligatoria.');
    const res = await this.conn().run(
      "INSERT INTO rutas (nombre, tipo, estado, fecha, fecha_planificada, hora_planificada, paquetes_llevados, notas) VALUES (?, ?, 'PROGRAMADA', ?, ?, ?, ?, ?);",
      [nombre, r.tipo, r.fecha_planificada, r.fecha_planificada, r.hora_planificada || null, paquetes, r.notas?.trim() || null]
    );
    await this.persist();
    return Number(res.changes?.lastId ?? 0);
  }

  async iniciarRutaProgramada(id: number, ubicacion?: { lat_inicio?: number; lng_inicio?: number }): Promise<void> {
    if (await this.obtenerRutaActiva()) throw new Error('Ya existe una ruta en curso.');
    if (!coordenadaValida(ubicacion?.lat_inicio, -90, 90) || !coordenadaValida(ubicacion?.lng_inicio, -180, 180)) throw new Error('La ubicación de inicio no es válida.');
    const ahora = new Date();
    const res = await this.conn().run(
      "UPDATE rutas SET estado = 'EN_CURSO', fecha = ?, hora_inicio = ?, lat_inicio = ?, lng_inicio = ? WHERE id = ? AND estado = 'PROGRAMADA';",
      [fechaLocalISO(ahora), horaLocalHHMM(ahora), ubicacion?.lat_inicio ?? null, ubicacion?.lng_inicio ?? null, id]
    );
    if (!res.changes?.changes) throw new Error('La ruta no existe o ya comenzó.');
    await this.persist();
  }

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
              COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM ventas v2 WHERE v2.cliente_id = v.cliente_id AND v2.fecha < r.fecha) THEN v.cliente_id END) as clientes_recompran
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       JOIN rutas r ON r.id = v.ruta_id
       WHERE v.ruta_id = ?;`,
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
      const vendidos = await this.conn().query('SELECT COALESCE(SUM(cantidad), 0) as n FROM ventas WHERE ruta_id = ?;', [v.ruta_id]);
      const yaVendidos = Number(vendidos.values?.[0]?.n ?? 0);
      const llevados = Number(row.paquetes_llevados ?? 0);
      if (yaVendidos + cantidad > llevados) throw new Error('No hay suficientes paquetes disponibles en la ruta. Disponibles: ' + Math.max(llevados - yaVendidos, 0) + '.');
    }
    const ahora = new Date();
    await this.conn().beginTransaction();
    try {
      const res = await this.conn().run(`INSERT INTO ventas (cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago, metodo_pago, monto_pagado, operacion_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, [v.cliente_id, v.ruta_id ?? null, productoNombre, cantidad, precio, costo, total, utilidad, fechaLocalISO(ahora), horaLocalHHMM(ahora), estado, estado === 'PAGADA' ? fechaLocalISO(ahora) : null, metodo, montoPagado, operacionId], false);
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
    const ventas = await this.conn().query(
      `SELECT id, total, COALESCE(monto_pagado,0) as monto_pagado
       FROM ventas
       WHERE cliente_id = ? AND total > COALESCE(monto_pagado,0)
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
        if (pagoOperacion) {
          const previo = await this.conn().query(
            'SELECT id FROM pagos WHERE operacion_id = ?;',
            [pagoOperacion],
          );
          if (previo.values?.length) {
            restante -= abono;
            aplicado += abono;
            continue;
          }
        }

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
              COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.fecha BETWEEN ? AND ?),0) as pagado,
              COALESCE(SUM(CASE WHEN total > COALESCE(monto_pagado,0) THEN total - COALESCE(monto_pagado,0) ELSE 0 END),0) as pendiente,
              COUNT(*) as numero_ventas
       FROM ventas WHERE fecha BETWEEN ? AND ?;`,
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
      'SELECT COUNT(*) as n FROM (SELECT cliente_id FROM ventas WHERE fecha BETWEEN ? AND ? GROUP BY cliente_id HAVING COUNT(*) > 1);',
      [desde, hasta]
    );
    const clientesActivos = await this.conn().query("SELECT COUNT(*) as n FROM clientes WHERE estado = 'activo';");
    const clientesPorContactar = await this.conn().query(
      'SELECT COUNT(*) as n FROM clientes WHERE estado = \'activo\' AND id IN (SELECT cliente_id FROM ventas GROUP BY cliente_id HAVING julianday(?) - julianday(MAX(fecha)) > ? AND julianday(?) - julianday(MAX(fecha)) <= ?);',
      [fechaLocalISO(), UMBRAL_POR_CONTACTAR_DIAS, fechaLocalISO(), UMBRAL_INACTIVO_DIAS]
    );
    const rutasRealizadas = await this.conn().query(
      "SELECT COUNT(*) as n FROM rutas WHERE estado = 'FINALIZADA' AND fecha BETWEEN ? AND ?;",
      [desde, hasta]
    );
    const cartera = await this.conn().query("SELECT COALESCE(SUM(total - COALESCE(monto_pagado,0)),0) as n FROM ventas WHERE total > COALESCE(monto_pagado,0);");

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
       WHERE ${filtros.join(' AND ')}
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

  async obtenerConfiguracion(): Promise<ConfiguracionApp> {
    const r = await this.conn().query('SELECT clave, valor FROM configuracion_app;');
    const valores = new Map((r.values ?? []).map((row) => [String(row.clave), String(row.valor)]));
    return {
      negocio_nombre: valores.get('negocio_nombre') ?? DEFAULT_CONFIG.negocio_nombre,
      usuario_nombre: valores.get('usuario_nombre') ?? DEFAULT_CONFIG.usuario_nombre,
      color_acento: valores.get('color_acento') ?? DEFAULT_CONFIG.color_acento,
      moneda: 'COP',
      mensaje_recordatorio: valores.get('mensaje_recordatorio') ?? DEFAULT_CONFIG.mensaje_recordatorio,
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
    return JSON.stringify(json.export, null, 2);
  }

  async importarRespaldo(jsonTexto: string): Promise<void> {
    if (!this.sqlite) throw new Error('SQLite no está inicializado.');

    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(jsonTexto);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('El respaldo debe ser un objeto JSON.');
      }
      data = parsed as Record<string, unknown>;
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error('El archivo no contiene JSON válido.');
      throw e;
    }

    if (data.database !== DB_NAME && data.database !== DB_NAME + '.db') {
      throw new Error('Este respaldo no pertenece a CAMELLO.');
    }
    data.database = this.activeDbName;
    if (data.mode !== 'full') throw new Error('El respaldo debe ser completo.');
    if (data.encrypted !== false) throw new Error('No se admiten respaldos cifrados en esta versión.');
    if (!Array.isArray(data.tables)) throw new Error('El respaldo está incompleto.');
    const version = Number(data.version);
    if (!Number.isInteger(version) || version < 1 || version > DB_VERSION) {
      throw new Error(`Versión de respaldo no compatible: ${String(data.version)}.`);
    }

    data.overwrite = true;
    const serialized = JSON.stringify(data);
    const valido = await this.sqlite.isJsonValid(serialized);
    if (!valido.result) throw new Error('El archivo de respaldo no tiene una estructura SQLite válida.');

    await this.cerrarConexion();

    try {
      await this.sqlite.importFromJson(serialized);
    } finally {
      await this.abrirConexion();
      await this.prepararEsquema();
      await this.seedProductosSiVacio();
      await this.persist();
    }
  }
}

export const database = new Database();
