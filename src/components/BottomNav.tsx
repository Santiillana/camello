import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Inicio', icon: '⌂', end: true },
  { to: '/clientes', label: 'Clientes', icon: '◉' },
  { to: '/rutas', label: 'Rutas', icon: '⌁' },
  { to: '/cartera', label: 'Cartera', icon: '$' },
];

export default function BottomNav() {
  const [mostrarAcciones, setMostrarAcciones] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <div className="bottom-nav-actions">
        {mostrarAcciones && (
          <div className="bottom-nav-menu" role="menu">
            <button type="button" onClick={() => { setMostrarAcciones(false); navigate('/venta-nueva'); }}>
              <span>▣</span> Nueva venta
            </button>
            <button type="button" onClick={() => { setMostrarAcciones(false); navigate('/rutas?nueva=1'); }}>
              <span>⌁</span> Nueva ruta
            </button>
          </div>
        )}
        <button
          type="button"
          className={'bottom-nav-fab' + (mostrarAcciones ? ' abierto' : '')}
          aria-label={mostrarAcciones ? 'Cerrar acciones' : 'Nueva acción'}
          aria-expanded={mostrarAcciones}
          onClick={() => setMostrarAcciones((valor) => !valor)}
        >
          +
        </button>
      </div>

      <nav className="bottom-nav" aria-label="Navegación rápida">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => 'bottom-nav-item' + (isActive ? ' activo' : '')}
          >
            <span className="bottom-nav-icono">{item.icon}</span>
            <span className="bottom-nav-etiqueta">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
