import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { DB_NAME, SCHEMA_STATEMENTS, MIGRACIONES, DB_VERSION } from './schema';
import { fechaLocal, horaLocal, diasDesdeFecha } from '../utils/format';
import type {
  Cliente,
  Mascota,
  Producto,
  Ruta,
  Venta,
  ClienteConResumen,
  RutaConResumen,
  ResumenPeriodo,
  EstadoSeguimiento,
} from '../types';

// Umbral (en días desde la última compra) para pasar de ACTIVO a POR_CONTACTAR,
// y de POR_CONTACTAR a INACTIVO. Ver spec: "umbral inicial 20 días, configurable".
export const UMBRAL_POR_CONTACTAR_DIAS = 20;
export const UMBRAL_INACTIVO_DIAS = 45;

class Database {
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private ready: Promise<void> | null = null;

  /** Inicializa la conexión (llamar una sola vez, al arrancar la app). */
  init(): Promise<void> {
    if (!this.ready) this.ready = this._init().catch((error) => { this.ready = null; throw error; });
    return this.ready;
  }

  private async _init(): Promise<void> {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    if (Capacitor.getPlatform() === 'web') {
      // En web (previsualización/pruebas) se usa el componente jeep-sqlite,
      // que a su vez guarda los datos en IndexedDB del navegador.
      // La app Android real usa SQLite nativo vía Capacitor, no esto.
      const jeepEl = document.querySelector('jeep-sqlite');
      if (!jeepEl) throw new Error('No se encontró jeep-sqlite para la versión web.');
      await customElements.whenDefined('jeep-sqlite');
      await this.sqlite.initWebStore();
    }

    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    this.db = isConn
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);

    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;');

    for (const stmt of SCHEMA_STATEMENTS) {
      await this.db.execute(stmt);
    }

    await this.ejecutarMigraciones();
    await this.seedProductosSiVacio();

    if (Capacitor.getPlatform() === 'web') {
      await this.sqlite.saveToStore(DB_NAME);
    }
  }

  private conn(): SQLiteDBConnection {
    if (!this.db) throw new Error('Base de datos no inicializada. Llama a database.init() primero.');
    return this.db;
  }

  /** Persiste cambios en IndexedDB cuando corre en web (no-op en nativo). */
  private async persist(): Promise<void> {
    if (Capacitor.getPlatform() === 'web' && this.sqlite) {
      await this.sqlite.saveToStore(DB_NAME);
    }
  }



  private async ejecutarMigraciones(): Promise<void> {
    const conn = this.conn();
    const versionResult = await conn.query('PRAGMA user_version;');
    const versionActual = Number(versionResult.values?.[0]?.user_version ?? 0);

    for (const migracion of MIGRACIONES) {
      if (migracion.version <= versionActual) continue;
      await conn.beginTransaction();
      try {
        for (const cambio of migracion.columns) {
          const info = await conn.query(`PRAGMA table_info(${cambio.table});`);
          const existe = (info.values ?? []).some((row) => row.name === cambio.column);
          if (!existe) await conn.execute(cambio.sql, false);
        }
        await conn.execute(`PRAGMA user_version = ${migracion.version};`, false);
        await conn.commitTransaction();
      } catch (error) {
        try { await conn.rollbackTransaction(); } catch {}
        throw new Error(`No se pudo migrar la base de datos a v${migracion.version}: ${String((error as Error)?.message ?? error)}`);
      }
    }

    if (!(await this.columnaExiste('clientes', 'ultimo_contacto')) || !(await this.columnaExiste('ventas', 'anulada'))) {
      throw new Error('La estructura de CAMELLO está incompleta después de la migración.');
    }
    if (versionActual < DB_VERSION) await conn.execute(`PRAGMA user_version = ${DB_VERSION};`);
  }

  private async columnaExiste(tabla: string, columna: string): Promise<boolean> {
    const r = await this.conn().query(`PRAGMA table_info(${tabla});`);
    return (r.values ?? []).some((row) => row.name === columna);
  }

  private async seedProductosSiVacio(): Promise<void> {
    const r = await this.conn().query('SELECT COUNT(*) as n FROM productos;');
    const n = r.values?.[0]?.n ?? 0;
    if (n === 0) {
      await this.conn().run(
        'INSERT INTO productos (nombre, precio, costo, activo) VALUES (?, ?, ?, 1);',
        ['Galletas naturales para mascota', 13000, 7000, 1]
      );
    }
  }

  // ---------------------------------------------------------------------
  // CLIENTES
  // ---------------------------------------------------------------------

  async crearCliente(c: Omit<Cliente, 'id' | 'fecha_registro' | 'estado'> & { fecha_registro?: string }): Promise<number> {
    const fecha = c.fecha_registro ?? fechaLocal();
    const res = await this.conn().run(
      `INSERT INTO clientes (nombre, telefono1, telefono2, cumple_dia, cumple_mes, fecha_registro, lat, lng, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [c.nombre, c.telefono1 ?? null, c.telefono2 ?? null, c.cumple_dia ?? null, c.cumple_mes ?? null, fecha, c.lat ?? null, c.lng ?? null, c.observaciones ?? null]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  async actualizarCliente(id: number, c: Partial<Cliente>): Promise<void> {
    const campos = Object.keys(c).filter((k) => k !== 'id');
    if (campos.length === 0) return;
    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => (c as Record<string, unknown>)[k] ?? null);
    await this.conn().run(`UPDATE clientes SET ${sets} WHERE id = ?;`, [...valores, id]);
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
      const like = `%${opts.texto.trim()}%`;
      cond.push(`(nombre LIKE ? COLLATE NOCASE OR telefono1 LIKE ? OR telefono2 LIKE ? OR EXISTS (
        SELECT 1 FROM mascotas m2 WHERE m2.cliente_id = clientes.id AND m2.estado = 'activo' AND m2.nombre LIKE ? COLLATE NOCASE
      ))`);
      params.push(like, like, like, like);
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
    if (!c) return null;
    return this.enriquecerCliente(c);
  }

  private async enriquecerCliente(c: Cliente): Promise<ClienteConResumen> {
    const mascotas = await this.listarMascotasPorCliente(c.id);
    const r = await this.conn().query(
      `SELECT MAX(fecha) as ultima, COALESCE(SUM(total),0) as total,
              COALESCE(SUM(CASE WHEN estado_pago = 'PENDIENTE' THEN total ELSE 0 END),0) as pendiente
       FROM ventas WHERE cliente_id = ? AND anulada = 0;`,
      [c.id]
    );
    const row = r.values?.[0] ?? {};
    const ultima_compra = row.ultima ?? null;
    return {
      ...c,
      mascotas,
      ultima_compra,
      total_comprado: row.total ?? 0,
      pendiente: row.pendiente ?? 0,
      seguimiento: this.calcularSeguimiento(ultima_compra, c.ultimo_contacto ?? null),
    };
  }

  private calcularSeguimiento(ultimaCompraISO: string | null, ultimoContactoISO: string | null): EstadoSeguimiento {
    const referencias = [ultimaCompraISO, ultimoContactoISO].filter(Boolean) as string[];
    if (referencias.length === 0) return 'POR_CONTACTAR';
    const referencia = referencias.sort().at(-1) ?? null;
    const dias = diasDesdeFecha(referencia);
    if (dias == null || dias <= UMBRAL_POR_CONTACTAR_DIAS) return 'ACTIVO';
    if (dias <= UMBRAL_INACTIVO_DIAS) return 'POR_CONTACTAR';
    return 'INACTIVO';
  }

  async registrarContacto(id: number): Promise<void> {
    await this.conn().run('UPDATE clientes SET ultimo_contacto = ? WHERE id = ?;', [fechaLocal(), id]);
    await this.persist();
  }

  // ---------------------------------------------------------------------
  // MASCOTAS
  // ---------------------------------------------------------------------

  async crearMascota(m: Omit<Mascota, 'id' | 'estado'>): Promise<number> {
    const res = await this.conn().run(
      `INSERT INTO mascotas (cliente_id, nombre, cumple_dia, cumple_mes, sexo, raza, tamano, preferencias, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [m.cliente_id, m.nombre, m.cumple_dia ?? null, m.cumple_mes ?? null, m.sexo ?? null, m.raza ?? null, m.tamano ?? null, m.preferencias ?? null, m.observaciones ?? null]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  async listarMascotasPorCliente(clienteId: number): Promise<Mascota[]> {
    const r = await this.conn().query(`SELECT * FROM mascotas WHERE cliente_id = ? AND estado = 'activo' ORDER BY nombre;`, [clienteId]);
    return (r.values ?? []) as Mascota[];
  }

  // ---------------------------------------------------------------------
  // PRODUCTOS
  // ---------------------------------------------------------------------

  async listarProductos(): Promise<Producto[]> {
    const r = await this.conn().query('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre;');
    return (r.values ?? []) as Producto[];
  }

  async crearProducto(p: Omit<Producto, 'id' | 'activo'>): Promise<number> {
    const res = await this.conn().run('INSERT INTO productos (nombre, precio, costo, activo) VALUES (?, ?, ?, 1);', [p.nombre, p.precio, p.costo]);
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  // ---------------------------------------------------------------------
  // RUTAS
  // ---------------------------------------------------------------------

  async iniciarRuta(r: { tipo: Ruta['tipo']; paquetes_llevados: number; lat_inicio?: number; lng_inicio?: number; notas?: string }): Promise<number> {
    if (await this.obtenerRutaActiva()) throw new Error('Ya existe una ruta en curso. Finalízala o cancélala antes de iniciar otra.');
    if (!Number.isInteger(r.paquetes_llevados) || r.paquetes_llevados <= 0) throw new Error('Los paquetes llevados deben ser mayores que cero.');
    const ahora = new Date();
    const res = await this.conn().run(
      `INSERT INTO rutas (tipo, estado, fecha, hora_inicio, lat_inicio, lng_inicio, paquetes_llevados, notas)
       VALUES (?, 'EN_CURSO', ?, ?, ?, ?, ?, ?);`,
      [r.tipo, fechaLocal(ahora), horaLocal(ahora), r.lat_inicio ?? null, r.lng_inicio ?? null, r.paquetes_llevados, r.notas ?? null]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  async finalizarRuta(id: number, fin?: { lat_fin?: number; lng_fin?: number }): Promise<void> {
    const ahora = new Date();
    await this.conn().run(
      `UPDATE rutas SET estado = 'FINALIZADA', hora_fin = ?, lat_fin = ?, lng_fin = ? WHERE id = ?;`,
      [ahora.toTimeString().slice(0, 5), fin?.lat_fin ?? null, fin?.lng_fin ?? null, id]
    );
    await this.persist();
  }

  async cancelarRuta(id: number): Promise<void> {
    await this.conn().run(`UPDATE rutas SET estado = 'CANCELADA' WHERE id = ?;`, [id]);
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
      `SELECT COALESCE(SUM(cantidad),0) as vendidos, COALESCE(SUM(total),0) as total_vendido,
              COALESCE(SUM(CASE WHEN anulada = 0 AND estado_pago='PENDIENTE' THEN total ELSE 0 END),0) as total_pendiente,
              COUNT(DISTINCT CASE WHEN anulada = 0 THEN cliente_id END) as clientes
       FROM ventas WHERE ruta_id = ? AND anulada = 0;`,
      [ruta.id]
    );
    const row = r.values?.[0] ?? {};
    const vendidos = row.vendidos ?? 0;
    return {
      ...ruta,
      vendidos,
      disponibles: Math.max(ruta.paquetes_llevados - vendidos, 0),
      total_vendido: row.total_vendido ?? 0,
      total_pendiente: row.total_pendiente ?? 0,
      clientes_atendidos: row.clientes ?? 0,
    };
  }

  // ---------------------------------------------------------------------
  // VENTAS
  // ---------------------------------------------------------------------

  async registrarVenta(v: {
    cliente_id: number;
    ruta_id?: number | null;
    producto_nombre: string;
    cantidad: number;
    precio_aplicado: number;
    costo_aplicado: number;
    estado_pago?: 'PAGADA' | 'PENDIENTE';
  }): Promise<number> {
    const ahora = new Date();
    if (!Number.isInteger(v.cantidad) || v.cantidad <= 0) throw new Error('La cantidad debe ser mayor que cero.');
    if (!Number.isFinite(v.precio_aplicado) || v.precio_aplicado < 0) throw new Error('El precio aplicado no es válido.');
    if (!Number.isFinite(v.costo_aplicado) || v.costo_aplicado < 0) throw new Error('El costo aplicado no es válido.');
    if (v.ruta_id != null) {
      const ruta = await this.conn().query('SELECT * FROM rutas WHERE id = ?;', [v.ruta_id]);
      const rr = ruta.values?.[0] as Ruta | undefined;
      if (!rr) throw new Error('La ruta asociada no existe.');
      if (rr.estado !== 'EN_CURSO') throw new Error('La ruta asociada ya no está en curso.');
      const vendidosR = await this.conn().query('SELECT COALESCE(SUM(cantidad),0) AS vendidos FROM ventas WHERE ruta_id = ? AND anulada = 0;', [v.ruta_id]);
      const vendidos = Number(vendidosR.values?.[0]?.vendidos ?? 0);
      if (vendidos + v.cantidad > rr.paquetes_llevados) throw new Error(`No hay suficientes paquetes en la ruta. Disponibles: ${Math.max(rr.paquetes_llevados - vendidos, 0)}.`);
    }
    const total = v.precio_aplicado * v.cantidad;
    const utilidad = (v.precio_aplicado - v.costo_aplicado) * v.cantidad;
    const estado = v.estado_pago ?? 'PENDIENTE';
    const res = await this.conn().run(
      `INSERT INTO ventas (cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago, anulada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
      [
        v.cliente_id,
        v.ruta_id ?? null,
        v.producto_nombre,
        v.cantidad,
        v.precio_aplicado,
        v.costo_aplicado,
        total,
        utilidad,
        fechaLocal(ahora),
        horaLocal(ahora),
        estado,
        estado === 'PAGADA' ? fechaLocal(ahora) : null,
      ]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }



  async anularVenta(id: number): Promise<void> {
    const r = await this.conn().query('SELECT id, anulada FROM ventas WHERE id = ?;', [id]);
    const venta = r.values?.[0];
    if (!venta) throw new Error('La venta no existe.');
    if (Number(venta.anulada) === 1) throw new Error('La venta ya está anulada.');
    await this.conn().run('UPDATE ventas SET anulada = 1 WHERE id = ?;', [id]);
    await this.persist();
  }

  async marcarVentaPagada(id: number): Promise<void> {
    const venta = await this.conn().query('SELECT anulada FROM ventas WHERE id = ?;', [id]);
    if (Number(venta.values?.[0]?.anulada ?? 0) === 1) throw new Error('Una venta anulada no puede marcarse como pagada.');
    await this.conn().run(`UPDATE ventas SET estado_pago = 'PAGADA', fecha_pago = ? WHERE id = ?;`, [fechaLocal(), id]);
    await this.persist();
  }

  async listarVentasPorCliente(clienteId: number): Promise<Venta[]> {
    const r = await this.conn().query('SELECT * FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC, hora DESC;', [clienteId]);
    return (r.values ?? []) as Venta[];
  }

  async listarVentasPorRuta(rutaId: number): Promise<Venta[]> {
    const r = await this.conn().query('SELECT * FROM ventas WHERE ruta_id = ? ORDER BY hora DESC;', [rutaId]);
    return (r.values ?? []) as Venta[];
  }

  // ---------------------------------------------------------------------
  // INFORMES
  // ---------------------------------------------------------------------

  async resumenPeriodo(desde: string, hasta: string): Promise<ResumenPeriodo> {
    const r = await this.conn().query(
      `SELECT COALESCE(SUM(total),0) as ventas, COALESCE(SUM(cantidad),0) as paquetes,
              COALESCE(SUM(utilidad),0) as utilidad,
              COALESCE(SUM(CASE WHEN estado_pago='PAGADA' THEN total ELSE 0 END),0) as pagado,
              COALESCE(SUM(CASE WHEN estado_pago='PENDIENTE' THEN total ELSE 0 END),0) as pendiente,
              COUNT(*) as numero_ventas
       FROM ventas WHERE fecha BETWEEN ? AND ? AND anulada = 0;`,
      [desde, hasta]
    );
    const row = r.values?.[0] ?? {};

    const rc = await this.conn().query('SELECT COUNT(*) as n FROM clientes WHERE fecha_registro BETWEEN ? AND ?;', [desde, hasta]);
    const clientes_nuevos = rc.values?.[0]?.n ?? 0;

    const numero_ventas = row.numero_ventas ?? 0;
    const ventas = row.ventas ?? 0;

    return {
      ventas,
      paquetes: row.paquetes ?? 0,
      utilidad: row.utilidad ?? 0,
      pagado: row.pagado ?? 0,
      pendiente: row.pendiente ?? 0,
      clientes_nuevos,
      numero_ventas,
      clientes_recurrentes: 0,
      ticket_promedio: numero_ventas > 0 ? ventas / numero_ventas : 0,
    };
  }

  async resumenHoy(): Promise<ResumenPeriodo> {
    const hoy = fechaLocal();
    return this.resumenPeriodo(hoy, hoy);
  }

  // ---------------------------------------------------------------------
  // RESPALDO
  // ---------------------------------------------------------------------

  /** Exporta toda la base de datos como JSON (para IMPORTAR/EXPORTAR RESPALDO). */
  async exportarRespaldo(): Promise<string> {
    const json = await this.conn().exportToJson('full');
    if (!json.export) throw new Error('No se pudo generar un respaldo válido.');
    return JSON.stringify(json.export, null, 2);
  }

  async importarRespaldo(jsonTexto: string): Promise<void> {
    const texto = jsonTexto.trim();
    if (!texto) throw new Error('El respaldo está vacío.');
    const data = JSON.parse(texto) as Record<string, unknown>;
    if (data.database !== DB_NAME) throw new Error('El archivo no pertenece a CAMELLO.');
    if (Number(data.version ?? 0) < DB_VERSION) throw new Error('El respaldo es de una versión anterior de CAMELLO.');
    if (!this.sqlite || !this.db) throw new Error('La base de datos no está inicializada.');

    const valido = await this.sqlite.isJsonValid(texto);
    if (!valido.result) throw new Error('El archivo no es un respaldo SQLite válido.');

    await this.persist();
    await this.db.close();
    await this.sqlite.closeConnection(DB_NAME, false);
    this.db = null;

    try {
      await this.sqlite.importFromJson(texto);
    } catch (error) {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
      await this.db.open();
      await this.db.execute('PRAGMA foreign_keys = ON;');
      throw new Error(`No se pudo restaurar el respaldo: ${String((error as Error)?.message ?? error)}`);
    }

    this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;');
    await this.ejecutarMigraciones();
    await this.persist();
  }
}

export const database = new Database();
