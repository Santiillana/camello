import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { CarteraItem } from '../types';
import { formatoMoneda } from '../utils/format';

export default function Cartera() {
  const [items, setItems] = useState<CarteraItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      setItems(await database.listarCartera());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const total = items.reduce((sum, item) => sum + item.pendiente, 0);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Cobros pendientes</p>
          <h1>Cartera</h1>
        </div>
      </header>

      <section className="dashboard-total">
        <span className="texto-kicker">Total por cobrar</span>
        <strong>{formatoMoneda(total)}</strong>
        <span className="detalle-cliente">{items.length} cliente(s) con saldo</span>
      </section>

      {error && <p className="texto-error">{error}</p>}

      {items.length === 0 ? (
        <p className="texto-vacio">No hay personas con pagos pendientes.</p>
      ) : (
        <ul className="lista-cartera">
          {items.map((item) => (
            <li key={item.cliente_id} className="fila-cartera tarjeta">
              <div>
                <Link to={\`/clientes/\${item.cliente_id}\`} className="enlace-principal">
                  <strong>{item.nombre}</strong>
                </Link>
                <span className="detalle-cliente">{item.ventas_pendientes} venta(s) pendiente(s)</span>
              </div>
              <div className="lado-derecho-cliente">
                <strong className="etiqueta-pendiente">{formatoMoneda(item.pendiente)}</strong>
                {item.telefono1 && (
                  <a
                    className="boton-chip"
                    href={'https://wa.me/57' + item.telefono1.replace(/\D/g, '')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    💬 Cobrar
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
