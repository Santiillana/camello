// Tipos centrales del dominio de CAMELLO.
// Reflejan 1:1 las tablas de la base de datos (ver src/db/schema.ts)

export type EstadoCliente = 'activo' | 'archivado';
export type EstadoMascota = 'activo' | 'archivado';
export type EstadoPago = 'PAGADA' | 'PENDIENTE';
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA_NEQUI' | 'FIADO' | 'PARCIAL';
export type EstadoRuta = 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA';
export type TipoRuta = 'Puerta a puerta' | 'Barrio' | 'Vereda' | 'Sector' | 'Visita comercial';
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
  fecha_planificada?: string;
  hora_planificada?: string;
  hora_inicio?: string;
  hora_fin?: string;
  lat_inicio?: number;
  lng_inicio?: number;
  lat_fin?: number;
  lng_fin?: number;
  paquetes_llevados: number;
  notas?: string;
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
}

export interface ResumenPeriodo {
  ventas: number;
  costos: number;
  paquetes: number;
  utilidad: number;
  pagado: number;
  pendiente: number;
  clientes_nuevos: number;
  clientes_recurrentes?: number;
  numero_ventas?: number;
  ticket_promedio?: number;
  rutas_realizadas?: number;
  clientes_activos?: number;
  clientes_por_contactar?: number;
  cartera_pendiente?: number;
}
