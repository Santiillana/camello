import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Inicio', icon: '🏠', fin: true },
  { to: '/clientes', label: 'Clientes', icon: '👤' },
  { to: '/venta-nueva', label: 'Vender', icon: '➕', destacado: true },
  { to: '/rutas', label: 'Rutas', icon: '🧭' },
  { to: '/mapa', label: 'Mapa', icon: '📍' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.fin}
          className={({ isActive }) =>
            'bottom-nav-item' + (isActive ? ' activo' : '') + (item.destacado ? ' destacado' : '')
          }
        >
          <span className="bottom-nav-icono">{item.icon}</span>
          <span className="bottom-nav-etiqueta">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
