import type { ReactNode } from 'react';

export type MetodoPagoVenta = 'EFECTIVO' | 'TRANSFERENCIA_NEQUI' | 'FIADO' | 'PARCIAL';
export type MetodoPagoCobro = 'EFECTIVO' | 'TRANSFERENCIA_NEQUI';

const ETIQUETAS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA_NEQUI: 'Transferencia / Nequi',
  FIADO: 'Fiado',
  PARCIAL: 'Pago parcial',
};

const DESCRIPCIONES: Record<string, string> = {
  EFECTIVO: 'Pago completo',
  TRANSFERENCIA_NEQUI: 'Pago electrónico',
  FIADO: '0 hoy',
  PARCIAL: 'Define cuánto paga',
};

type Props<T extends string> = {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  extra?: ReactNode;
};

export default function MetodoPagoSelector<T extends MetodoPagoVenta | MetodoPagoCobro>({
  value,
  options,
  onChange,
  extra,
}: Props<T>) {
  return (
    <div className="metodos-pago">
      {options.map((id) => (
        <button
          type="button"
          key={id}
          className={'metodo-pago-card' + (value === id ? ' activo' : '')}
          onClick={() => onChange(id)}
        >
          <strong>{ETIQUETAS[id] ?? id}</strong>
          <span>{DESCRIPCIONES[id] ?? 'Seleccionado'}</span>
        </button>
      ))}
      {extra}
    </div>
  );
}
