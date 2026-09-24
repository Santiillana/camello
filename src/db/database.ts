import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { DB_NAME, DB_VERSION, SCHEMA_STATEMENTS } from './schema';
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
import { diasDesdeISO, fechaLocalISO, horaLocalHHMM } from '../utils/format';

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
  'observaciones',
  'estado',
]);

function textoObligatorio(valor: string, campo: string): string {
  const resultado = valor.trim();
  if (!resultado) throw new Error(`${campo} es obligatorio.`);
  return resultado;
}

function numeroNoNegativo(valor: number, campo: string): number {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error(`${campo} debe ser un número válido mayor o igual a 0.`);
  }
  return valor;
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
  private ready: Promise<void> | null = null;

  init(): Promise<void> {
    if (!this.ready) this.ready = this._init();
    return this.ready;
  }

  private async _init(): Promise<void> {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);

    if (Capacitor.getPlatform() === 'web') {
      const jeepEl = document.querySelector('jeep-sqlite');
      if (!jeepEl) {
        throw new Error('SQLite web no está listo: no se encontró <jeep-sqlite> en el DOM.');
      }

      await customElements.whenDefined('jeep-sqlite');
      await this.sqlite.initWebStore();
    }

    await this.abrirConexion();
    await this.seedProductosSiVacio();
    await this.persist();
  }

  private async abrirConexion(): Promise<void> {
    if (!this.sqlite) throw new Error('Conexión SQLite no disponible.');

    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    this.db = isConn
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);

    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;');

    for (const stmt of SCHEMA_STATEMENTS) {
      await this.db.execute(stmt);
    }
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
      await this.sqlite.closeConnection(DB_NAME, false);
    } catch {
      // La conexión puede no existir después de una restauración fallida.
    }

    this.db = null;
  }

  private conn(): SQLiteDBConnection {
    if (!this.db) throw new Error('Base de datos no inicializada. Llama a database.init() primero.');
    return this.db;
  }

  private async persist(): Promise<void> {
    if (Capacitor.getPlatform() === 'web' && this.sqlite) {
      await this.sqlite.saveToStore(DB_NAME);
    }
  }

  private async seedProductosSiVacio(): Promise<void> {
    const r = await this.conn().query('SELECT COUNT(*) as n FROM productos;');
    const n = Number(r.values?.[0]?.n ?? 0);
    if (n === 0) {
      await this.conn().run(
        'INSERT INTO productos (nombre, precio, costo, activo) VALUES (?, ?, ?, 1);',
        ['Galletas naturales para mascota', 13000, 7000]
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

  async actualizarCliente(id: number, c: Partial<Cliente>): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) throw new Error('Cliente inválido.');

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
      cond.push('(nombre LIKE ? OR telefono1 LIKE ? OR telefono2 LIKE ?)');
      params.push(`%${texto}%`, `%${texto}%`, `%${texto}%`);
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

  private async enriquecerCliente(c: Cliente): Promise<ClienteConResumen> {
    const [mascotas, r] = await Promise.all([
      this.listarMascotasPorCliente(c.id),
      this.conn().query(
        `SELECT MAX(fecha) as ultima, COALESCE(SUM(total),0) as total,
                COALESCE(SUM(CASE WHEN estado_pago = 'PENDIENTE' THEN total ELSE 0 END),0) as pendiente
         FROM ventas WHERE cliente_id = ?;`,
        [c.id]
      ),
    ]);

    const row = r.values?.[0] ?? {};
    const ultima_compra = row.ultima ?? null;

    return {
      ...c,
      mascotas,
      ultima_compra,
      total_comprado: Number(row.total ?? 0),
      pendiente: Number(row.pendiente ?? 0),
      seguimiento: this.calcularSeguimiento(ultima_compra),
    };
  }

  private calcularSeguimiento(ultimaCompraISO: string | null): EstadoSeguimiento {
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

  // PRODUCTOS

  async listarProductos(): Promise<Producto[]> {
    const r = await this.conn().query('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre;');
    return (r.values ?? []) as Producto[];
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

  async iniciarRuta(r: { tipo: Ruta['tipo']; paquetes_llevados: number; lat_inicio?: number; lng_inicio?: number; notas?: string }): Promise<number> {
    const paquetes = enteroPositivo(r.paquetes_llevados, 'Los paquetes llevados');

    const activa = await this.obtenerRutaActiva();
    if (activa) throw new Error('Ya existe una ruta en curso.');

    if (!coordenadaValida(r.lat_inicio, -90, 90) || !coordenadaValida(r.lng_inicio, -180, 180)) {
      throw new Error('La ubicación de inicio no es válida.');
    }

    const ahora = new Date();
    const res = await this.conn().run(
      `INSERT INTO rutas (tipo, estado, fecha, hora_inicio, lat_inicio, lng_inicio, paquetes_llevados, notas)
       VALUES (?, 'EN_CURSO', ?, ?, ?, ?, ?, ?);`,
      [
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

  async finalizarRuta(id: number, fin?: { lat_fin?: number; lng_fin?: number }): Promise<void> {
    if (!coordenadaValida(fin?.lat_fin, -90, 90) || !coordenadaValida(fin?.lng_fin, -180, 180)) {
      throw new Error('La ubicación de cierre no es válida.');
    }

    const actual = await this.conn().query('SELECT estado FROM rutas WHERE id = ?;', [id]);
    if (!actual.values?.length) throw new Error('La ruta no existe.');
    if (actual.values[0].estado !== 'EN_CURSO') throw new Error('Solo se puede finalizar una ruta que está en curso.');

    const ahora = new Date();
    await this.conn().run(
      `UPDATE rutas SET estado = 'FINALIZADA', hora_fin = ?, lat_fin = ?, lng_fin = ? WHERE id = ? AND estado = 'EN_CURSO';`,
      [horaLocalHHMM(ahora), fin?.lat_fin ?? null, fin?.lng_fin ?? null, id]
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
      `SELECT COALESCE(SUM(cantidad),0) as vendidos, COALESCE(SUM(total),0) as total_vendido,
              COALESCE(SUM(CASE WHEN estado_pago='PENDIENTE' THEN total ELSE 0 END),0) as total_pendiente,
              COUNT(DISTINCT cliente_id) as clientes
       FROM ventas WHERE ruta_id = ?;`,
      [ruta.id]
    );
    const row = r.values?.[0] ?? {};
    const vendidos = Number(row.vendidos ?? 0);

    return {
      ...ruta,
      vendidos,
      disponibles: Math.max(ruta.paquetes_llevados - vendidos, 0),
      total_vendido: Number(row.total_vendido ?? 0),
      total_pendiente: Number(row.total_pendiente ?? 0),
      clientes_atendidos: Number(row.clientes ?? 0),
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
  }): Promise<number> {
    const cantidad = enteroPositivo(v.cantidad, 'La cantidad');
    const precio = numeroNoNegativo(v.precio_aplicado, 'El precio aplicado');
    const costo = numeroNoNegativo(v.costo_aplicado, 'El costo aplicado');
    const productoNombre = textoObligatorio(v.producto_nombre, 'El producto');

    const cliente = await this.conn().query('SELECT id FROM clientes WHERE id = ? AND estado = \'activo\';', [v.cliente_id]);
    if (!cliente.values?.length) throw new Error('El cliente no existe o está archivado.');

    if (v.ruta_id != null) {
      const ruta = await this.conn().query('SELECT estado, paquetes_llevados FROM rutas WHERE id = ?;', [v.ruta_id]);
      const row = ruta.values?.[0];
      if (!row) throw new Error('La ruta no existe.');
      if (row.estado !== 'EN_CURSO') throw new Error('No se pueden registrar ventas en una ruta que no está en curso.');

      const vendidos = await this.conn().query(
        'SELECT COALESCE(SUM(cantidad), 0) as n FROM ventas WHERE ruta_id = ?;',
        [v.ruta_id]
      );
      const yaVendidos = Number(vendidos.values?.[0]?.n ?? 0);
      const llevados = Number(row.paquetes_llevados ?? 0);
      if (yaVendidos + cantidad > llevados) {
        throw new Error(`No hay suficientes paquetes disponibles en la ruta. Disponibles: ${Math.max(llevados - yaVendidos, 0)}.`);
      }
    }

    const ahora = new Date();
    const total = precio * cantidad;
    const utilidad = (precio - costo) * cantidad;
    const estado = v.estado_pago ?? 'PENDIENTE';

    const res = await this.conn().run(
      `INSERT INTO ventas (cliente_id, ruta_id, producto_nombre, cantidad, precio_aplicado, costo_aplicado, total, utilidad, fecha, hora, estado_pago, fecha_pago)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        v.cliente_id,
        v.ruta_id ?? null,
        productoNombre,
        cantidad,
        precio,
        costo,
        total,
        utilidad,
        fechaLocalISO(ahora),
        horaLocalHHMM(ahora),
        estado,
        estado === 'PAGADA' ? fechaLocalISO(ahora) : null,
      ]
    );
    await this.persist();
    return Number(res.changes?.lastId ?? 0);
  }

  async marcarVentaPagada(id: number): Promise<void> {
    await this.conn().run(
      'UPDATE ventas SET estado_pago = \'PAGADA\', fecha_pago = ? WHERE id = ? AND estado_pago = \'PENDIENTE\';',
      [fechaLocalISO(), id]
    );
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

  // INFORMES

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

    const rc = await this.conn().query(
      'SELECT COUNT(*) as n FROM clientes WHERE fecha_registro BETWEEN ? AND ?;',
      [desde, hasta]
    );
    const clientes_nuevos = Number(rc.values?.[0]?.n ?? 0);
    const numero_ventas = Number(row.numero_ventas ?? 0);
    const ventas = Number(row.ventas ?? 0);

    return {
      ventas,
      paquetes: Number(row.paquetes ?? 0),
      utilidad: Number(row.utilidad ?? 0),
      pagado: Number(row.pagado ?? 0),
      pendiente: Number(row.pendiente ?? 0),
      clientes_nuevos,
      numero_ventas,
      ticket_promedio: numero_ventas > 0 ? ventas / numero_ventas : 0,
    };
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

    if (data.database !== DB_NAME) throw new Error('Este respaldo no pertenece a CAMELLO.');
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
      await this.persist();
    }
  }
}

export const database = new Database();
