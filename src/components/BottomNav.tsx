import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function BottomNav() {
  const [mostrarAcciones, setMostrarAcciones] = useState(false);
  const navigate = useNavigate();

  function irA(ruta: string) {
    setMostrarAcciones(false);
    navigate(ruta);
  }

  return (
    <div className="bottom-nav-actions" aria-label="Acciones rápidas">
      {mostrarAcciones && (
        <div className="bottom-nav-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => irA('/venta-nueva')}>
            <span aria-hidden="true">▣</span> Nueva venta
          </button>
          <button type="button" role="menuitem" onClick={() => irA('/rutas?nuevo=1')}>
            <span aria-hidden="true">⌁</span> Nueva ruta
          </button>
          <button type="button" role="menuitem" onClick={() => irA('/gastos?nuevo=1')}>
            <span aria-hidden="true">◫</span> Nuevo gasto
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
  );
}
