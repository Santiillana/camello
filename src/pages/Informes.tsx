import { useEffect, useState } from 'react';
import { database } from '../db/database';
import type { ResumenPeriodo } from '../types';
import { formatoMoneda, hoyISO, inicioMesISO, inicioSemanaISO, sumarDiasISO } from '../utils/format';

export default function Informes() {
  const [hoy, setHoy] = useState<ResumenPeriodo | null>(null);
  const [semana, setSemana] = useState<ResumenPeriodo | null>(null);
  const [mes, setMes] = useState<ResumenPeriodo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desde,setDesde]=useState(inicioMesISO()); const [hasta,setHasta]=useState(hoyISO()); const [rango,setRango]=useState<ResumenPeriodo|null>(null);

  useEffect(() => {
    const fin = hoyISO();
    Promise.all([
      database.resumenPeriodo(fin, fin),
      database.resumenPeriodo(inicioSemanaISO(), fin),
      database.resumenPeriodo(inicioMesISO(), fin),
    ]).then(([rHoy, rSemana, rMes]) => {
      setHoy(rHoy);
      setSemana(rSemana);
      setMes(rMes);
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Resultados</p>
          <h1>Informes</h1>
        </div>
      </header>

      {error && <p className="texto-error">{error}</p>}
      <BloquePeriodo titulo="Hoy" resumen={hoy} />
      <BloquePeriodo titulo="Esta semana" resumen={semana} extendido />
      <BloquePeriodo titulo="Este mes" resumen={mes} extendido mes />
    </div>
  );
}

function BloquePeriodo({
  titulo,
  resumen,
  extendido,
  mes,
}: {
  titulo: string;
  resumen: ResumenPeriodo | null;
  extendido?: boolean;
  mes?: boolean;
}) {
  return (
    <section className="bloque-informe tarjeta">
      <div className="fila-titulo-boton">
        <h2>{titulo}</h2>
        {resumen && <span className="detalle-cliente">{resumen.numero_ventas ?? 0} ventas</span>}
      </div>

      {!resumen ? (
        <p className="texto-vacio">Cargando…</p>
      ) : (
        <>
          <div className="grid-stats">
            <MiniStat etiqueta="Total vendido" valor={formatoMoneda(resumen.ventas)} />
            <MiniStat etiqueta="Paquetes" valor={String(resumen.paquetes)} />
            <MiniStat etiqueta="Materia prima" valor={formatoMoneda(resumen.costos)} />
            <MiniStat etiqueta="Utilidad" valor={formatoMoneda(resumen.utilidad)} />
            {mes && <MiniStat etiqueta="Gastos" valor={formatoMoneda(resumen.gastos_operativos ?? 0)} />}
            {mes && <MiniStat etiqueta="Utilidad neta" valor={formatoMoneda(resumen.utilidad_neta ?? resumen.utilidad)} alerta={(resumen.utilidad_neta ?? 0) < 0} />}
            <MiniStat etiqueta="Cobrado" valor={formatoMoneda(resumen.pagado)} />
            <MiniStat etiqueta="Pendiente" valor={formatoMoneda(resumen.pendiente)} alerta={resumen.pendiente > 0} />
          </div>

          <div className="lista-resumen">
            <div><span>Clientes nuevos</span><strong>{resumen.clientes_nuevos}</strong></div>
            {extendido && <div><span>Clientes recurrentes</span><strong>{resumen.clientes_recurrentes ?? 0}</strong></div>}
            {extendido && <div><span>Rutas realizadas</span><strong>{resumen.rutas_realizadas ?? 0}</strong></div>}
            {mes && <div><span>Clientes activos</span><strong>{resumen.clientes_activos ?? 0}</strong></div>}
            {mes && <div><span>Clientes por contactar</span><strong>{resumen.clientes_por_contactar ?? 0}</strong></div>}
            {mes && <div><span>Cartera total actual</span><strong>{formatoMoneda(resumen.cartera_pendiente ?? 0)}</strong></div>}
            {mes && <div><span>Por pagar de gastos</span><strong>{formatoMoneda(resumen.gastos_pendientes ?? 0)}</strong></div>}
            {extendido && <div><span>Ticket promedio</span><strong>{formatoMoneda(resumen.ticket_promedio ?? 0)}</strong></div>}
          </div>
        </>
      )}
    </section>
  );
}

function MiniStat({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={'stat-card' + (alerta ? ' alerta' : '')}>
      <span className="stat-valor">{valor}</span>
      <span className="stat-etiqueta">{etiqueta}</span>
    </div>
  );
}
