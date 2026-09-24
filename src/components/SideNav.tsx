import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Inicio', icon: 'M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-7v6h-4A1.5 1.5 0 0 1 3 19.5v-9Z', end: true },
  { to: '/venta-nueva', label: 'Ventas', icon: 'M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8M8 16h6' },
  { to: '/clientes', label: 'Clientes', icon: 'M7 20a5 5 0 0 1 10 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { to: '/rutas', label: 'Rutas', icon: 'M5 19h4V5H5v14Zm6 0h4V9h-4v10Zm6 0h2v-6h-2v6ZM3 21h18' },
  { to: '/cartera', label: 'Cartera', icon: 'M4 7h16v12H4V7Zm0 3h16M8 15h4' },
  { to: '/mapa', label: 'Mapa', icon: 'M4 5l6-2 6 2 4-2v16l-4 2-6-2-6 2V5Zm6-2v16m6-14v16' },
  { to: '/recordatorios', label: 'Recordatorios', icon: 'M7 18h10l-1-2v-5a4 4 0 0 0-8 0v5l-1 2Zm3 3h4' },
  { to: '/gastos', label: 'Gastos', icon: 'M4 5h16v14H4zM7 9h10M7 13h6' },
  { to: '/informes', label: 'Informes', icon: 'M5 19V9M12 19V5M19 19v-8' },
  { to: '/respaldo', label: 'Respaldo', icon: 'M12 3v12m0 0 4-4m-4 4-4-4M5 20h14' },
  { to: '/configuracion', label: 'Configuración', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5 1 2.1 2.2.5 1.8-1.1 1.6 1.6-1.1 1.8.5 2.2L21 12l-2.1 1  -.5 2.2 1.1 1.8-1.6 1.6-1.8-1.1-2.2.5L12 21l-1-2.1-2.2-.5-1.8 1.1-1.6-1.6 1.1-1.8-.5-2.2L3 12l2.1-1 .5-2.2-1.1-1.8 1.6-1.6 1.8 1.1 2.2-.5L12 3Z' },
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
      <aside className={'side-nav' + (expandido ? ' expandido' : '')} aria-label="Navegación principal">
        <div className="side-nav-cabecera">
          <strong className="side-nav-marca">CAMELLO</strong>
          <button
            type="button"
            className="side-nav-toggle"
            aria-label={expandido ? 'Contraer menú' : 'Expandir menú'}
            title={expandido ? 'Contraer menú' : 'Expandir menú'}
            onClick={onAlternarExpandido}
          >
            {expandido ? '‹' : '›'}
          </button>
          {expandido && (
            <button
              type="button"
              className="side-nav-cerrar"
              aria-label="Cerrar menú"
              onClick={onCerrar}
            >
              ×
            </button>
          )}
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
              aria-label={item.label}
            >
              <span className="side-nav-icono" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img" focusable="false">
                  <path d={item.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="side-nav-texto">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
