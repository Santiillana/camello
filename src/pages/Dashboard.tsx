import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { CarteraItem, ConfiguracionApp, ResumenPeriodo } from '../types';
import { formatoMoneda, hoyISO, inicioMesISO, inicioSemanaISO } from '../utils/format';

type Periodo = 'hoy' | 'semana' | 'mes';

type Props = {
  config: ConfiguracionApp;
};

type Recordatorio = {
  cliente_id: number;
  nombre: string;
  telefono1?: string;
};

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

export default function Dashboard({ config }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [resumenes, setResumenes] = useState<Record<Periodo, ResumenPeriodo | null>>({
    hoy: null,
    semana: null,
    mes: null,
  });
  const [cartera, setCartera] = useState<CarteraItem[]>([]);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [rutaActivaId, setRutaActivaId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const hoy = hoyISO();
      const [rHoy, rSemana, rMes, cuentas, ruta, clientes] = await Promise.all([
        database.resumenPeriodo(hoy, hoy),
        database.resumenPeriodo(inicioSemanaISO(), hoy),
        database.resumenPeriodo(inicioMesISO(), hoy),
        database.listarCartera(),
        database.obtenerRutaActiva(),
        database.listarClientes({ soloActivos: true }),
      ]);
      setResumenes({ hoy: rHoy, semana: rSemana, mes: rMes });
      setCartera(cuentas);
      setRutaActivaId(ruta?.id ?? null);
      setRecordatorios(
        clientes
          .filter((cliente) => cliente.dias_desde_ultima_compra != null && cliente.dias_desde_ultima_compra > 20)
          .sort((a, b) => (b.dias_desde_ultima_compra ?? 0) - (a.dias_desde_ultima_compra ?? 0))
          .slice(0, 5)
          .map((cliente) => ({ cliente_id: cliente.id, nombre: cliente.nombre, telefono1: cliente.telefono1 }))
      );
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  const resumen = resumenes[periodo];
  const totalCartera = useMemo(
    () => cartera.reduce((total, item) => total + item.pendiente, 0),
    [cartera],
  );

  return (
    <div className="pantalla">
      <header className="encabezado encabezado-inicio">
        <div>
          <p className="texto-kicker">{config.negocio_nombre}</p>
          <h1>¿Cómo vamos?</h1>
          <p className="subtitulo">Hola, {config.usuario_nombre}</p>
        </div>
        <Link to="/configuracion" className="icono-boton" aria-label="Configuración">⚙️</Link>
      </header>

      {rutaActivaId && (
        <Link to={`/rutas/${rutaActivaId}`} className="banner-ruta-activa">
          🧭 Hay una ruta en curso — continuar
        </Link>
      )}

      <section className="periodo-selector" aria-label="Periodo">
        {PERIODOS.map((item) => (
          <button
            type="button"
            key={item.id}
            className={'periodo-tab' + (periodo === item.id ? ' activo' : '')}
            onClick={() => setPeriodo(item.id)}
          >
            {item.label}
          </button>
        ))}
      </section>

      {error && <p className="texto-error">{error}</p>}

      {resumen ? (
        <>
          <section className="dashboard-total">
            <span className="texto-kicker">Total vendido</span>
            <strong>{formatoMoneda(resumen.ventas)}</strong>
            <span className="detalle-cliente">{resumen.numero_ventas ?? 0} ventas · {resumen.paquetes} paquetes</span>
          </section>

          <section className="grid-stats">
            <StatCard etiqueta="Materia prima" valor={formatoMoneda(resumen.costos)} />
            <StatCard etiqueta="Utilidad" valor={formatoMoneda(resumen.utilidad)} />
            <StatCard etiqueta="Cobrado" valor={formatoMoneda(resumen.pagado)} />
            <StatCard etiqueta="Pendiente" valor={formatoMoneda(resumen.pendiente)} alerta={resumen.pendiente > 0} />
            {periodo === 'mes' && <StatCard etiqueta="Gastos" valor={formatoMoneda(resumen.gastos_operativos ?? 0)} />}
            {periodo === 'mes' && <StatCard etiqueta="Utilidad neta" valor={formatoMoneda(resumen.utilidad_neta ?? resumen.utilidad)} alerta={(resumen.utilidad_neta ?? 0) < 0} />}
          </section>

          <section className="tarjeta">
            <div className="fila-titulo-boton">
              <div>
                <p className="texto-kicker">Seguimiento</p>
                <h2>Recordatorio de recompra</h2>
              </div>
              <Link to="/recordatorios" className="boton-texto">Ver todos</Link>
            </div>
            {recordatorios.length === 0 ? (
              <p className="texto-vacio">No hay clientes con más de 20 días sin comprar.</p>
            ) : (
              <ul className="lista-recordatorios">
                {recordatorios.map((item) => (
                  <li key={item.cliente_id} className="fila-recordatorio">
                    <Link to={`/clientes/${item.cliente_id}`}>
                      <strong>{item.nombre}</strong>
                      <span>Más de 20 días sin comprar</span>
                    </Link>
                    {item.telefono1 && (
                      <a
                        className="boton-chip"
                        href={'https://wa.me/57' + item.telefono1.replace(/\D/g, '')}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Escribir
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="texto-vacio">Cargando métricas…</p>
      )}

      <section className="accesos-rapidos">
        <Link to="/venta-nueva" className="acceso-boton venta">➕ Nueva venta</Link>
        <Link to="/rutas?nuevo=1" className="acceso-boton ruta">🧭 Nueva ruta</Link>
      </section>

      <section className="tarjeta cartera-resumen">
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Dinero pendiente</p>
            <h2>Cartera</h2>
          </div>
          <Link to="/cartera" className="boton-texto">Ver toda</Link>
        </div>
        <strong className="cartera-total">{formatoMoneda(totalCartera)}</strong>
        {cartera.length === 0 ? (
          <p className="texto-vacio">No hay saldos pendientes.</p>
        ) : (
          <ul className="lista-cartera compacta">
            {cartera.slice(0, 5).map((item) => (
              <li key={item.cliente_id} className="fila-cartera">
                <Link to={`/clientes/${item.cliente_id}`}>
                  <strong>{item.nombre}</strong>
                  <span>{item.ventas_pendientes} pendiente(s)</span>
                </Link>
                <div className="lado-derecho-cliente">
                  <span className="etiqueta-pendiente">{formatoMoneda(item.pendiente)}</span>
                  <Link className="boton-chip" to={"/cartera?cliente=" + item.cliente_id}>Pagar</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}

function StatCard({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={'stat-card' + (alerta ? ' alerta' : '')}>
      <span className="stat-valor">{valor}</span>
      <span className="stat-etiqueta">{etiqueta}</span>
    </div>
  );
}
