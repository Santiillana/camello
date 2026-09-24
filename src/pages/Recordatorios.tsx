import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen } from '../types';
import { formatoMoneda, hoyISO } from '../utils/format';

type Filtro = '7' | '15' | '20' | 'ritmo';

export default function Recordatorios() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('20');
  const [mensaje, setMensaje] = useState('Hola {nombre}, ¿cómo están? Ya podría ser momento de su próxima compra en COMBOPITT.');
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const [items, config] = await Promise.all([
        database.listarClientes({ soloActivos: true }),
        database.obtenerConfiguracion(),
      ]);
      setClientes(items.filter((cliente) =>
        cliente.dias_desde_ultima_compra != null &&
        cliente.dias_desde_ultima_compra > 0,
      ));
      if (config.mensaje_recordatorio) setMensaje(config.mensaje_recordatorio);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const filtrados = useMemo(() => {
    const ahora = hoyISO();
    return clientes
      .filter((cliente) => {
        if (cliente.recordar_hasta && cliente.recordar_hasta > ahora) return false;
        const dias = cliente.dias_desde_ultima_compra ?? 0;
        if (filtro === 'ritmo') return dias >= cliente.ritmo_dias;
        return dias >= Number(filtro);
      })
      .sort((a, b) => {
        const retrasoA = (a.dias_desde_ultima_compra ?? 0) - a.ritmo_dias;
        const retrasoB = (b.dias_desde_ultima_compra ?? 0) - b.ritmo_dias;
        return retrasoB - retrasoA;
      });
  }, [clientes, filtro]);

  function mensajePara(cliente: ClienteConResumen): string {
    return mensaje
      .replaceAll('{nombre}', cliente.nombre)
      .replaceAll('{dias}', String(cliente.dias_desde_ultima_compra ?? 0));
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Seguimiento</p>
          <h1>Recordatorios</h1>
        </div>
      </header>

      <p className="texto-vacio">Recompra vencida ordenada por retraso respecto al ritmo de cada cliente.</p>

      <div className="periodo-selector">
        {([
          ['7', '7 días'],
          ['15', '15 días'],
          ['20', '20 días'],
          ['ritmo', 'Según ritmo'],
        ] as Array<[Filtro, string]>).map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={'periodo-tab' + (filtro === id ? ' activo' : '')}
            onClick={() => setFiltro(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="texto-error">{error}</p>}

      {filtrados.length === 0 ? (
        <p className="texto-vacio">No hay recordatorios vencidos con este filtro.</p>
      ) : (
        <ul className="lista-clientes">
          {filtrados.map((cliente) => (
            <RecordatorioItem
              key={cliente.id}
              cliente={cliente}
              mensaje={mensajePara(cliente)}
              onActualizado={cargar}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordatorioItem({
  cliente,
  mensaje,
  onActualizado,
}: {
  cliente: ClienteConResumen;
  mensaje: string;
  onActualizado: () => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);

  async function marcarContactado() {
    setGuardando(true);
    try {
      await database.registrarContactoCliente(cliente.id);
      await onActualizado();
    } finally {
      setGuardando(false);
    }
  }

  async function recordar() {
    const valor = window.prompt('¿Recordar en cuántos días?', '7');
    if (!valor) return;
    const dias = Number(valor);
    if (!Number.isInteger(dias) || dias <= 0) return;
    setGuardando(true);
    try {
      await database.recordarClienteEn(cliente.id, dias);
      await onActualizado();
    } finally {
      setGuardando(false);
    }
  }

  const whatsapp = cliente.telefono1
    ? 'https://wa.me/57' + cliente.telefono1.replace(/\D/g, '') + '?text=' + encodeURIComponent(mensaje)
    : null;

  return (
    <li className="tarjeta">
      <div className="fila-titulo-boton">
        <div>
          <Link to={`/clientes/${cliente.id}`} className="enlace-principal">
            <strong>{cliente.nombre}</strong>
          </Link>
          <div className="detalle-cliente">
            {cliente.dias_desde_ultima_compra ?? 0} días sin comprar · ritmo {cliente.ritmo_dias} días
          </div>
        </div>
        <span className="etiqueta-pendiente">
          {cliente.pendiente > 0 ? formatoMoneda(cliente.pendiente) : ''}
        </span>
      </div>
      <div className="fila-botones">
        {whatsapp && (
          <a className="boton-primario" href={whatsapp} target="_blank" rel="noreferrer">
            💬 Escribir
          </a>
        )}
        <button className="boton-secundario" disabled={guardando} onClick={() => void marcarContactado()}>
          Contactado
        </button>
        <button className="boton-texto" disabled={guardando} onClick={() => void recordar()}>
          Recordar en N días
        </button>
      </div>
    </li>
  );
}
