import { useState } from 'react';
import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Inicio', icon: '⌂', end: true },
  { to: '/venta-nueva', label: 'Ventas', icon: '▣' },
  { to: '/clientes', label: 'Clientes', icon: '◉' },
  { to: '/rutas', label: 'Rutas', icon: '⌁' },
  { to: '/cartera', label: 'Cartera', icon: '$' },
  { to: '/mapa', label: 'Mapa', icon: '⌖' },
  { to: '/recordatorios', label: 'Recordatorios', icon: '◷' },
  { to: '/informes', label: 'Informes', icon: '▤' },
  { to: '/respaldo', label: 'Respaldo', icon: '↥' },
  { to: '/configuracion', label: 'Configuración', icon: '⚙' },
];

type Props = {
  abierto: boolean;
  expandido: boolean;
  onCerrar: () => void;
  onAlternarExpandido: () => void;
};

export default function SideNav({ abierto, expandido, onCerrar, onAlternarExpandido }: Props) {
  return (
    <>
      <button
        type="button"
        className={'side-nav-backdrop' + (abierto ? ' visible' : '')}
        aria-label="Cerrar menú"
        onClick={onCerrar}
      />
      <aside className={'side-nav' + (abierto ? ' abierto' : '') + (expandido ? ' expandido' : '')}>
        <div className="side-nav-cabecera">
          <strong className="side-nav-marca">{expandido ? 'CAMELLO' : 'C'}</strong>
          <button
            type="button"
            className="side-nav-toggle"
            aria-label={expandido ? 'Contraer menú' : 'Expandir menú'}
            onClick={onAlternarExpandido}
          >
            {expandido ? '‹' : '›'}
          </button>
          <button
            type="button"
            className="side-nav-cerrar"
            aria-label="Cerrar menú"
            onClick={onCerrar}
          >
            ×
          </button>
        </div>

        <nav className="side-nav-lista" aria-label="Secciones de CAMELLO">
          {ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCerrar}
              className={({ isActive }) => 'side-nav-item' + (isActive ? ' activo' : '')}
              title={item.label}
            >
              <span className="side-nav-icono">{item.icon}</span>
              <span className="side-nav-texto">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
