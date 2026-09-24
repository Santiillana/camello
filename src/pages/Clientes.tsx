import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import ClienteForm from '../components/ClienteForm';
import { database } from '../db/database';
import type { ClienteConResumen } from '../types';
import { formatoMoneda, hoyISO, inicioMesISO } from '../utils/format';

const ETIQUETA_SEGUIMIENTO: Record<string, string> = {
  ACTIVO: 'Activo',
  POR_CONTACTAR: 'Por contactar',
  INACTIVO: 'Inactivo',
};

function normalizarBusqueda(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export default function Clientes() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [params] = useSearchParams();
  const [mostrarForm, setMostrarForm] = useState(params.get('nuevo') === '1');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function cargar() {
    try {
      const todos = await database.listarClientes({ soloActivos: true });
      setClientes(todos);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const filtrados = useMemo(() => {
    const texto = normalizarBusqueda(busqueda);
    if (!texto) return clientes;
    return clientes.filter((c) => {
      const base = [
        c.nombre,
        c.telefono1 ?? '',
        c.telefono2 ?? '',
        ...c.mascotas.map((m) => m.nombre),
      ].join(' ');
      return normalizarBusqueda(base).includes(texto);
    });
  }, [clientes, busqueda]);

  const metricas = useMemo(() => {
    const inicioMes = inicioMesISO();
    const activos = clientes.length;
    const conDeuda = clientes.filter((c) => c.pendiente > 0).length;
    const sinComprar = clientes.filter((c) => c.dias_desde_ultima_compra != null && c.dias_desde_ultima_compra > 20).length;
    const nuevosMes = clientes.filter((c) => c.fecha_registro >= inicioMes && c.fecha_registro <= hoyISO()).length;
    const totalVendido = clientes.reduce((sum, c) => sum + c.total_comprado, 0);
    const totalCompras = clientes.reduce((sum, c) => sum + c.numero_compras, 0);
    const ticketPromedio = totalCompras > 0 ? totalVendido / totalCompras : 0;
    const frecuencia = clientes.filter((c) => c.numero_compras >= 2).reduce((sum, c) => sum + c.ritmo_dias, 0);
    const frecuenciaCount = clientes.filter((c) => c.numero_compras >= 2).length;
    const mejorMonto = [...clientes].sort((a, b) => b.total_comprado - a.total_comprado).slice(0, 3);
    const mejorFrecuencia = [...clientes].sort((a, b) => a.ritmo_dias - b.ritmo_dias).slice(0, 3);
    const cumpleanos = clientes.filter((c) => c.cumple_dia && c.cumple_mes).length +
      clientes.reduce((sum, c) => sum + c.mascotas.filter((m) => m.cumple_dia && m.cumple_mes).length, 0);
    return {
      activos,
      conDeuda,
      sinComprar,
      nuevosMes,
      ticketPromedio,
      frecuencia: frecuenciaCount > 0 ? frecuencia / frecuenciaCount : 20,
      mejorMonto,
      mejorFrecuencia,
      cumpleanos,
    };
  }, [clientes]);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Clientes</h1>
        <button
          className="boton-secundario"
          onClick={() => {
            const siguiente = !mostrarForm;
            setMostrarForm(siguiente);
            navigate(siguiente ? '/clientes?nuevo=1' : '/clientes');
          }}
        >
          {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
        </button>
      </header>

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && (
        <ClienteForm
          textoBoton="Guardar cliente"
          onGuardado={(id) => {
            setMostrarForm(false);
            void cargar();
            navigate(`/clientes/${id}`);
          }}
          onCancelar={() => {
            setMostrarForm(false);
            navigate('/clientes');
          }}
        />
      )}

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Métricas</p>
            <h2>Resumen de clientes</h2>
          </div>
        </div>
        <div className="grid-stats">
          <div className="stat-card"><span className="stat-valor">{metricas.activos}</span><span className="stat-etiqueta">Activos</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.conDeuda}</span><span className="stat-etiqueta">Con deuda</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.sinComprar}</span><span className="stat-etiqueta">Sin comprar +20 días</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.nuevosMes}</span><span className="stat-etiqueta">Nuevos del mes</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.ticketPromedio)}</span><span className="stat-etiqueta">Ticket promedio</span></div>
          <div className="stat-card"><span className="stat-valor">{Math.round(metricas.frecuencia)} d</span><span className="stat-etiqueta">Frecuencia media</span></div>
        </div>

        <div className="metricas-listas">
          <div>
            <strong>Mejores clientes por monto</strong>
            <ul>
              {metricas.mejorMonto.map((c) => <li key={c.id}><span>{c.nombre}</span><strong>{formatoMoneda(c.total_comprado)}</strong></li>)}
            </ul>
          </div>
          <div>
            <strong>Clientes con ritmo de compra más frecuente</strong>
            <ul>
              {metricas.mejorFrecuencia.map((c) => <li key={c.id}><span>{c.nombre}</span><strong>cada {c.ritmo_dias} días</strong></li>)}
            </ul>
          </div>
          <div>
            <strong>Próximos cumpleaños registrados</strong>
            <p className="texto-vacio">{metricas.cumpleanos} cumpleaños con día y mes guardados.</p>
          </div>
        </div>
      </section>

      <input
        className="campo-busqueda"
        placeholder="Buscar por cliente o mascota…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <ul className="lista-clientes">
        {filtrados.map((c) => (
          <li key={c.id}>
            <Link to={`/clientes/${c.id}`} className="tarjeta-cliente">
              <div>
                <strong>{c.nombre}</strong>
                <div className="detalle-cliente">
                  {c.mascotas.length > 0 && <span>{c.mascotas.map((m) => m.nombre).join(', ')} · </span>}
                  {c.ultima_compra ? `Última compra: ${c.ultima_compra}` : 'Sin compras aún'}
                </div>
              </div>
              <div className="lado-derecho-cliente">
                {c.pendiente > 0 && <span className="etiqueta-pendiente">{formatoMoneda(c.pendiente)}</span>}
                <span className={'etiqueta-seguimiento ' + c.seguimiento.toLowerCase()}>
                  {ETIQUETA_SEGUIMIENTO[c.seguimiento]}
                </span>
              </div>
            </Link>
          </li>
        ))}
        {filtrados.length === 0 && !error && <p className="texto-vacio">No hay clientes que coincidan con la búsqueda.</p>}
      </ul>
    </div>
  );
}
