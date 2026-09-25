// Tipos centrales del dominio de CAMELLO.
// Reflejan 1:1 las tablas de la base de datos (ver src/db/schema.ts)

export type EstadoCliente = 'activo' | 'archivado';
export type EstadoMascota = 'activo' | 'archivado';
export type EstadoPago = 'PAGADA' | 'PENDIENTE';
export type EstadoRegistro = 'activa' | 'anulada';
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA_NEQUI' | 'FIADO' | 'PARCIAL';
export type EstadoRuta = 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA';
export type TipoRuta = 'Puerta a puerta' | 'Venta local móvil' | 'Entrega de pedidos';
export type EstadoPedido = 'PENDIENTE' | 'ASIGNADO' | 'ENTREGADO' | 'NO_ENTREGADO' | 'CANCELADO';
export type SexoMascota = 'M' | 'H' | 'Desconocido';
export type TamanoMascota = 'Pequeño' | 'Mediano' | 'Grande';
export type EstadoSeguimiento = 'ACTIVO' | 'POR_CONTACTAR' | 'INACTIVO';

export type ModoRitmo = 'automatico' | 'manual';
export type FuenteUbicacion = 'gps' | 'whatsapp' | 'manual';
export type CategoriaFoto = 'cliente' | 'mascota' | 'casa';

export interface Foto {
  id: number;
  cliente_id: number;
  categoria: CategoriaFoto;
  referencia?: string;
  data_url: string;
  creado_at: string;
}

export interface ConfiguracionApp {
  negocio_nombre: string;
  usuario_nombre: string;
  color_acento: string;
  moneda: 'COP';
  mensaje_recordatorio?: string;
  pin_habilitado?: boolean;
  pin_lock_minutos?: number;
  privacidad_habilitada?: boolean;
  privacidad_texto?: string;
  responsable_datos?: string;
  privacy_accepted_at?: string | null;
  privacy_responsable?: string;
}

export interface CarteraItem {
  cliente_id: number;
  nombre: string;
  telefono1?: string;
  pendiente: number;
  ventas_pendientes: number;
}

export interface MascotaConCliente extends Mascota {
  cliente_nombre: string;
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono1?: string;
  telefono2?: string;
  cumple_dia?: number;
  cumple_mes?: number;
  fecha_registro: string; // ISO date
  lat?: number;
  lng?: number;
  ubicacion_precision_m?: number | null;
  ubicacion_fuente?: FuenteUbicacion | null;
  ubicacion_fecha?: string | null;
  observaciones?: string;
  estado: EstadoCliente;
}

export interface Mascota {
  id: number;
  cliente_id: number;
  nombre: string;
  cumple_dia?: number;
  cumple_mes?: number;
  sexo?: SexoMascota;
  raza?: string;
  tamano?: TamanoMascota;
  preferencias?: string;
  observaciones?: string;
  estado: EstadoMascota;
}

export interface Producto {
  id: number;
  nombre: string;
  precio: number;
  costo: number;
  activo: 0 | 1;
}

export interface Ruta {
  id: number;
  nombre: string;
  tipo: TipoRuta;
  estado: EstadoRuta;
  fecha: string;
  hora_inicio?: string;
  hora_fin?: string;
  lat_inicio?: number;
  lng_inicio?: number;
  lat_fin?: number;
  lng_fin?: number;
  paquetes_llevados: number;
  paquetes_sobrantes?: number;
  notas?: string;
}

export interface PedidoItem {
  id: number;
  pedido_id: number;
  producto_id?: number | null;
  producto_nombre: string;
  cantidad: number;
  precio_aplicado: number;
  costo_aplicado: number;
  total: number;
}

export interface Pedido {
  id: number;
  cliente_id: number;
  fecha_pedido: string;
  fecha_entrega: string;
  estado: EstadoPedido;
  ruta_id?: number | null;
  orden_entrega?: number | null;
  notas?: string | null;
  total_estimado: number;
  pago_estado: 'PENDIENTE' | 'COBRADO' | 'FIADO';
  created_at: string;
  updated_at: string;
  entregado_at?: string | null;
}

export interface PedidoConDetalle extends Pedido {
  cliente_nombre: string;
  cliente_telefono?: string | null;
  items: PedidoItem[];
}

export interface Venta {
  id: number;
  cliente_id: number;
  ruta_id?: number | null;
  producto_nombre: string;
  cantidad: number;
  precio_aplicado: number; // snapshot histórico — nunca se recalcula
  costo_aplicado: number;  // snapshot histórico — nunca se recalcula
  total: number;
  utilidad: number;
  fecha: string; // ISO date
  hora: string;  // HH:MM
  estado_pago: EstadoPago;
  fecha_pago?: string | null;
  metodo_pago?: MetodoPago | string;
  monto_pagado?: number;
  operacion_id?: string | null;
  pedido_id?: number | null;
  estado_registro?: EstadoRegistro;
  motivo_anulacion?: string | null;
  anulada_at?: string | null;
}

// Vistas compuestas usadas en la UI (no son tablas)

export interface ClienteConResumen extends Cliente {
  mascotas: Mascota[];
  primera_compra?: string | null;
  ultima_compra?: string | null;
  dias_desde_ultima_compra?: number;
  total_comprado: number;
  total_pagado: number;
  pendiente: number;
  paquetes_comprados: number;
  numero_compras: number;
  ventas_pendientes: number;
  ticket_promedio: number;
  seguimiento: EstadoSeguimiento;
  ritmo_modo: ModoRitmo;
  ritmo_dias: number;
  contactado_fecha?: string | null;
  recordar_hasta?: string | null;
}

export interface RutaConResumen extends Ruta {
  vendidos: number;
  disponibles: number;
  sobrantes: number;
  costos: number;
  utilidad: number;
  numero_ventas: number;
  clientes_nuevos: number;
  duracion_minutos?: number | null;
  total_vendido: number;
  total_pendiente: number;
  clientes_atendidos: number;
  clientes_recompran?: number;
  cobrado?: number;
  fiado?: number;
  ticket_promedio?: number;
  ventas_por_hora?: number;
  gastos_asociados?: number;
  utilidad_neta?: number;
}

export interface ResumenProductoPeriodo {
  producto_nombre: string;
  cantidad: number;
  ventas: number;
  utilidad: number;
  clientes: number;
}

export interface ResumenPeriodo {
  ventas: number;
  costos: number;
  paquetes: number;
  utilidad: number;
  pagado: number;
  pendiente: number;
  clientes_atendidos?: number;
  productos_distintos?: number;
  ventas_pagadas?: number;
  ventas_pendientes?: number;
  compras_insumos?: number;
  gastos_fijos?: number;
  retiros_dueno?: number;
  flujo_caja?: number;
  clientes_nuevos: number;
  clientes_recurrentes?: number;
  numero_ventas?: number;
  ticket_promedio?: number;
  rutas_realizadas?: number;
  clientes_activos?: number;
  clientes_por_contactar?: number;
  cartera_pendiente?: number;
  gastos_operativos?: number;
  utilidad_neta?: number;
  gastos_pendientes?: number;
}


export type TipoCategoriaGasto = 'fijo' | 'variable';
export type NaturalezaGasto = 'operativo' | 'compra_insumos' | 'retiro_dueno';
export type EstadoGasto = 'pagado' | 'pendiente' | 'anulado';
export type EstadoGastoPersonal = 'pagado' | 'pendiente';

export interface CategoriaGasto {
  id: number;
  nombre: string;
  tipo: TipoCategoriaGasto;
  naturaleza: NaturalezaGasto;
  presupuesto_mensual?: number | null;
  activa: 0 | 1;
  orden: number;
}

export interface Pago {
  id: number;
  venta_id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
  hora: string;
  metodo_pago: string;
  operacion_id?: string | null;
  estado_registro: EstadoRegistro;
  motivo_anulacion?: string | null;
  anulada_at?: string | null;
}

export interface GastoPersonal {
  id: number;
  fecha: string;
  monto: number;
  categoria: string;
  tipo: TipoCategoriaGasto;
  descripcion?: string | null;
  estado: EstadoGastoPersonal;
  created_at: string;
  updated_at: string;
}

export interface Gasto {
  id: number;
  fecha: string;
  monto: number;
  categoria_id: number;
  descripcion?: string | null;
  metodo_pago?: string | null;
  estado: EstadoGasto;
  fecha_pago?: string | null;
  fecha_limite?: string | null;
  proveedor?: string | null;
  ruta_id?: number | null;
  recurrente_id?: number | null;
  periodo: string;
  foto_ref?: string | null;
  operacion_id?: string | null;
  created_at: string;
  updated_at: string;
  archivado: 0 | 1;
  motivo_anulacion?: string | null;
  anulado_at?: string | null;
  categoria_nombre?: string;
  naturaleza?: NaturalezaGasto;
}

export interface ResultadoMes {
  desde?: string;
  hasta?: string;
  periodo: string;
  ventas: number;
  costo_materia_prima: number;
  utilidad_bruta: number;
  gastos_operativos: number;
  utilidad_neta: number;
  margen_neto: number;
  cobrado: number;
  gastos_pagados: number;
  flujo_caja: number;
  gastos_pendientes: number;
}
