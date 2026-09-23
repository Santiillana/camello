import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen } from '../types';
import { formatoMoneda } from '../utils/format';

export default function Recordatorios() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    database.listarClientes({ soloActivos: true }).then((items) => {
      setClientes(items.filter((cliente) => cliente.seguimiento === 'POR_CONTACTAR'));
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Seguimiento</p>
          <h1>Recordatorios</h1>
        </div>
      </header>

      <p className="texto-vacio">Clientes cuya última compra ya requiere seguimiento.</p>

      {error && <p className="texto-error">{error}</p>}

      {clientes.length === 0 ? (
        <p className="texto-vacio">No hay clientes pendientes de contacto.</p>
      ) : (
        <ul className="lista-clientes">
          {clientes.map((cliente) => (
            <li key={cliente.id} className="tarjeta">
              <div className="fila-titulo-boton">
                <div>
                  <Link to={`/clientes/${cliente.id}`} className="enlace-principal">
                    <strong>{cliente.nombre}</strong>
                  </Link>
                  <div className="detalle-cliente">
                    {cliente.ultima_compra ? `Última compra: ${cliente.ultima_compra}` : 'Sin compras'}
                  </div>
                </div>
                <span className="etiqueta-pendiente">
                  {cliente.pendiente > 0 ? formatoMoneda(cliente.pendiente) : ''}
                </span>
              </div>
              <div className="fila-botones">
                {cliente.telefono1 && (
                  <a
                    className="boton-primario"
                    href={'https://wa.me/57' + cliente.telefono1.replace(/\D/g, '')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    💬 Escribirle
                  </a>
                )}
                <Link className="boton-secundario" to={`/clientes/${cliente.id}`}>Ver ficha</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
