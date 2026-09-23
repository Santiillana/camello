import { useEffect, useState } from 'react';
import { database } from '../db/database';
import type { ResumenPeriodo } from '../types';
import { formatoMoneda, hoyISO, inicioSemanaISO, inicioMesISO } from '../utils/format';

export default function Informes() {
  const [hoy, setHoy] = useState<ResumenPeriodo | null>(null);
  const [semana, setSemana] = useState<ResumenPeriodo | null>(null);
  const [mes, setMes] = useState<ResumenPeriodo | null>(null);

  useEffect(() => {
    const fin = hoyISO();
    database.resumenPeriodo(fin, fin).then(setHoy);
    database.resumenPeriodo(inicioSemanaISO(), fin).then(setSemana);
    database.resumenPeriodo(inicioMesISO(), fin).then(setMes);
  }, []);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Informes</h1>
      </header>

      <BloquePeriodo titulo="Hoy" resumen={hoy} />
      <BloquePeriodo titulo="Esta semana" resumen={semana} />
      <BloquePeriodo titulo="Este mes" resumen={mes} extendido />
    </div>
  );
}

function BloquePeriodo({ titulo, resumen, extendido }: { titulo: string; resumen: ResumenPeriodo | null; extendido?: boolean }) {
  return (
    <section className="bloque-informe">
      <h2>{titulo}</h2>
      {!resumen ? (
        <p className="texto-vacio">Cargando…</p>
      ) : (
        <div className="grid-stats">
          <MiniStat etiqueta="Ventas" valor={formatoMoneda(resumen.ventas)} />
          <MiniStat etiqueta="Paquetes" valor={String(resumen.paquetes)} />
          <MiniStat etiqueta="Utilidad" valor={formatoMoneda(resumen.utilidad)} />
          <MiniStat etiqueta="Pagado" valor={formatoMoneda(resumen.pagado)} />
          <MiniStat etiqueta="Pendiente" valor={formatoMoneda(resumen.pendiente)} alerta={resumen.pendiente > 0} />
          <MiniStat etiqueta="Clientes nuevos" valor={String(resumen.clientes_nuevos)} />
          {extendido && <MiniStat etiqueta="Ticket promedio" valor={formatoMoneda(resumen.ticket_promedio ?? 0)} />}
        </div>
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
