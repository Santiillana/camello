import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { DB_NAME, SCHEMA_STATEMENTS } from './schema';
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
    if (!this.ready) this.ready = this._init();
    return this.ready;
  }

  private async _init(): Promise<void> {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    if (Capacitor.getPlatform() === 'web') {
      // En web (previsualización/pruebas) se usa el componente jeep-sqlite,
      // que a su vez guarda los datos en IndexedDB del navegador.
      // La app Android real usa SQLite nativo vía Capacitor, no esto.
      const jeepEl = document.querySelector('jeep-sqlite');
      if (jeepEl) {
        await customElements.whenDefined('jeep-sqlite');
        await this.sqlite.initWebStore();
      }
    }

    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    this.db = isConn
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

    await this.db.open();

    // SQLite no aplica FOREIGN KEY por defecto en todas las plataformas.
    // Activarlo evita ventas/mascotas huérfanas y hace cumplir las relaciones del modelo.
    await this.db.execute('PRAGMA foreign_keys = ON;');

    for (const stmt of SCHEMA_STATEMENTS) {
      await this.db.execute(stmt);
    }

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
    const nombre = c.nombre.trim();
    if (!nombre) throw new Error('El nombre del cliente es obligatorio.');
    const fecha = c.fecha_registro ?? new Date().toISOString().slice(0, 10);
    const res = await this.conn().run(
      `INSERT INTO clientes (nombre, telefono1, telefono2, cumple_dia, cumple_mes, fecha_registro, lat, lng, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [nombre, c.telefono1?.trim() || null, c.telefono2 ?? null, c.cumple_dia ?? null, c.cumple_mes ?? null, fecha, c.lat ?? null, c.lng ?? null, c.observaciones ?? null]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  async actualizarCliente(id: number, c: Partial<Cliente>): Promise<void> {
    const permitidos = new Set(['nombre', 'telefono1', 'telefono2', 'cumple_dia', 'cumple_mes', 'fecha_registro', 'lat', 'lng', 'observaciones', 'estado']);
    const campos = Object.keys(c).filter((k) => permitidos.has(k));
    if (campos.length === 0) return;
    const sets = campos.map((k) => `${k} = ?`).join(', ');
    const valores = campos.map((k) => {
      const value = (c as Record<string, unknown>)[k];
      return typeof value === 'string' ? (value.trim() || null) : (value ?? null);
    });
    if (campos.includes('nombre') && !String((c as Record<string, unknown>).nombre ?? '').trim()) {
      throw new Error('El nombre del cliente es obligatorio.');
    }
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
    if (opts?.texto) {
      cond.push('(nombre LIKE ? OR telefono1 LIKE ? OR telefono2 LIKE ?)');
      params.push(`%${opts.texto}%`, `%${opts.texto}%`, `%${opts.texto}%`);
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
       FROM ventas WHERE cliente_id = ?;`,
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
      seguimiento: this.calcularSeguimiento(ultima_compra),
    };
  }

  private calcularSeguimiento(ultimaCompraISO: string | null): EstadoSeguimiento {
    if (!ultimaCompraISO) return 'POR_CONTACTAR';
    const dias = Math.floor((Date.now() - new Date(ultimaCompraISO).getTime()) / 86_400_000);
    if (dias <= UMBRAL_POR_CONTACTAR_DIAS) return 'ACTIVO';
    if (dias <= UMBRAL_INACTIVO_DIAS) return 'POR_CONTACTAR';
    return 'INACTIVO';
  }

  // ---------------------------------------------------------------------
  // MASCOTAS
  // ---------------------------------------------------------------------

  async crearMascota(m: Omit<Mascota, 'id' | 'estado'>): Promise<number> {
    if (!Number.isInteger(m.cliente_id) || m.cliente_id < 1) throw new Error('El cliente de la mascota no es válido.');
    if (!m.nombre.trim()) throw new Error('El nombre de la mascota es obligatorio.');
    const res = await this.conn().run(
      `INSERT INTO mascotas (cliente_id, nombre, cumple_dia, cumple_mes, sexo, raza, tamano, preferencias, observaciones, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo');`,
      [m.cliente_id, m.nombre.trim(), m.cumple_dia ?? null, m.cumple_mes ?? null, m.sexo ?? null, m.raza ?? null, m.tamano ?? null, m.preferencias ?? null, m.observaciones ?? null]
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
    if (!Number.isInteger(r.paquetes_llevados) || r.paquetes_llevados < 1) {
      throw new Error('La cantidad de paquetes debe ser un número entero mayor que cero.');
    }

    const activa = await this.obtenerRutaActiva();
    if (activa) {
      throw new Error('Ya existe una ruta en curso. Finalízala antes de iniciar otra.');
    }

    const ahora = new Date();
    const res = await this.conn().run(
      `INSERT INTO rutas (tipo, estado, fecha, hora_inicio, lat_inicio, lng_inicio, paquetes_llevados, notas)
       VALUES (?, 'EN_CURSO', ?, ?, ?, ?, ?, ?);`,
      [r.tipo, ahora.toISOString().slice(0, 10), ahora.toTimeString().slice(0, 5), r.lat_inicio ?? null, r.lng_inicio ?? null, r.paquetes_llevados, r.notas ?? null]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  async finalizarRuta(id: number, fin?: { lat_fin?: number; lng_fin?: number }): Promise<void> {
    const actual = await this.conn().query('SELECT estado FROM rutas WHERE id = ?;', [id]);
    const estado = actual.values?.[0]?.estado;
    if (!estado) throw new Error('La ruta no existe.');
    if (estado !== 'EN_CURSO') throw new Error('Solo puedes finalizar una ruta que está en curso.');
    const ahora = new Date();
    await this.conn().run(
      `UPDATE rutas SET estado = 'FINALIZADA', hora_fin = ?, lat_fin = ?, lng_fin = ? WHERE id = ? AND estado = 'EN_CURSO';`,
      [ahora.toTimeString().slice(0, 5), fin?.lat_fin ?? null, fin?.lng_fin ?? null, id]
    );
    await this.persist();
  }

  async cancelarRuta(id: number): Promise<void> {
    const actual = await this.conn().query('SELECT estado FROM rutas WHERE id = ?;', [id]);
    const estado = actual.values?.[0]?.estado;
    if (!estado) throw new Error('La ruta no existe.');
    if (estado !== 'EN_CURSO' && estado !== 'PROGRAMADA') throw new Error('Esta ruta ya terminó y no se puede cancelar.');
    await this.conn().run(`UPDATE rutas SET estado = 'CANCELADA' WHERE id = ? AND estado IN ('EN_CURSO','PROGRAMADA');`, [id]);
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
              COALESCE(SUM(CASE WHEN estado_pago='PENDIENTE' THEN total ELSE 0 END),0) as total_pendiente,
              COUNT(DISTINCT cliente_id) as clientes
       FROM ventas WHERE ruta_id = ?;`,
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
    if (!Number.isInteger(v.cantidad) || v.cantidad < 1) {
      throw new Error('La cantidad debe ser un número entero mayor que cero.');
    }
    if (!Number.isFinite(v.precio_aplicado) || v.precio_aplicado < 0) {
      throw new Error('El precio aplicado no es válido.');
    }
    if (!Number.isFinite(v.costo_aplicado) || v.costo_aplicado < 0) {
      throw new Error('El costo aplicado no es válido.');
    }
    if (!v.producto_nombre.trim()) throw new Error('El producto de la venta es obligatorio.');

    const cliente = await this.conn().query('SELECT estado FROM clientes WHERE id = ?;', [v.cliente_id]);
    if (!cliente.values?.[0]) throw new Error('El cliente seleccionado no existe.');
    if (cliente.values[0].estado !== 'activo') throw new Error('No puedes registrar ventas para un cliente archivado.');

    if (v.ruta_id != null) {
      const ruta = await this.conn().query('SELECT estado, paquetes_llevados FROM rutas WHERE id = ?;', [v.ruta_id]);
      const rutaRow = ruta.values?.[0] as { estado?: string; paquetes_llevados?: number } | undefined;
      if (!rutaRow) throw new Error('La ruta seleccionada no existe.');
      if (rutaRow.estado !== 'EN_CURSO') throw new Error('Solo puedes registrar ventas en una ruta en curso.');

      const vendidos = await this.conn().query(
        'SELECT COALESCE(SUM(cantidad), 0) as vendidos FROM ventas WHERE ruta_id = ?;',
        [v.ruta_id]
      );
      const yaVendidos = Number(vendidos.values?.[0]?.vendidos ?? 0);
      if (yaVendidos + v.cantidad > Number(rutaRow.paquetes_llevados ?? 0)) {
        throw new Error('No hay suficientes paquetes disponibles en esta ruta.');
      }
    }

    const ahora = new Date();
    const total = v.precio_aplicado * v.cantidad;
    const utilidad = (v.precio_aplicado - v.costo_aplicado) * v.cantidad;
    const estado = v.estado_pago ?? 'PENDIENTE';
    const res = await this.conn().run(
      `INSERT INTO ventas (cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        v.cliente_id,
        v.ruta_id ?? null,
        v.producto_nombre,
        v.cantidad,
        v.precio_aplicado,
        v.costo_aplicado,
        total,
        utilidad,
        ahora.toISOString().slice(0, 10),
        ahora.toTimeString().slice(0, 5),
        estado,
        estado === 'PAGADA' ? ahora.toISOString().slice(0, 10) : null,
      ]
    );
    await this.persist();
    return res.changes?.lastId ?? 0;
  }

  async marcarVentaPagada(id: number): Promise<void> {
    const actual = await this.conn().query('SELECT estado_pago FROM ventas WHERE id = ?;', [id]);
    if (!actual.values?.[0]) throw new Error('La venta no existe.');
    if (actual.values[0].estado_pago === 'PAGADA') return;
    await this.conn().run(`UPDATE ventas SET estado_pago = 'PAGADA', fecha_pago = ? WHERE id = ? AND estado_pago = 'PENDIENTE';`, [new Date().toISOString().slice(0, 10), id]);
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
       FROM ventas WHERE fecha BETWEEN ? AND ?;`,
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
      ticket_promedio: numero_ventas > 0 ? ventas / numero_ventas : 0,
    };
  }

  async resumenHoy(): Promise<ResumenPeriodo> {
    const hoy = new Date().toISOString().slice(0, 10);
    return this.resumenPeriodo(hoy, hoy);
  }

  // ---------------------------------------------------------------------
  // RESPALDO
  // ---------------------------------------------------------------------

  /** Exporta toda la base de datos como JSON (para IMPORTAR/EXPORTAR RESPALDO). */
  async exportarRespaldo(): Promise<string> {
    const json = await this.conn().exportToJson('full');
    return JSON.stringify(json.export ?? {}, null, 2);
  }

  async importarRespaldo(jsonTexto: string): Promise<void> {
    if (!this.sqlite) throw new Error('La base de datos no está inicializada.');

    let data: unknown;
    try {
      data = JSON.parse(jsonTexto);
    } catch {
      throw new Error('El archivo de respaldo no contiene JSON válido.');
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('El respaldo tiene un formato inválido.');
    }

    const respaldo = data as { database?: unknown; overwrite?: unknown };
    if (respaldo.database !== DB_NAME) {
      throw new Error('El respaldo no pertenece a la base de datos de CAMELLO.');
    }

    // La pantalla advierte que la restauración reemplaza los datos actuales.
    // El plugin conserva los datos existentes por defecto, por eso activamos overwrite.
    respaldo.overwrite = true;

    const texto = JSON.stringify(respaldo);
    const valido = await this.sqlite.isJsonValid(texto);
    if (!valido.result) {
      throw new Error('El archivo no es un respaldo SQLite válido de CAMELLO.');
    }

    const resultado = await this.sqlite.importFromJson(texto);
    if ((resultado.changes?.changes ?? 0) < 0) {
      throw new Error('SQLite no pudo restaurar el respaldo.');
    }

    await this.persist();
  }
}

export const database = new Database();
