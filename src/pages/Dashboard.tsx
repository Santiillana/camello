import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ResumenPeriodo } from '../types';
import { formatoMoneda } from '../utils/format';

export default function Dashboard() {
  const [resumen, setResumen] = useState<ResumenPeriodo | null>(null);
  const [rutaActivaId, setRutaActivaId] = useState<number | null>(null);

  async function cargar() {
    const [r, ruta] = await Promise.all([database.resumenHoy(), database.obtenerRutaActiva()]);
    setResumen(r);
    setRutaActivaId(ruta?.id ?? null);
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>CAMELLO</h1>
        <p className="subtitulo">¿Cómo voy hoy?</p>
      </header>

      {rutaActivaId && (
        <Link to={`/rutas/${rutaActivaId}`} className="banner-ruta-activa">
          🧭 Tienes una ruta en curso — toca para continuar
        </Link>
      )}

      <section className="grid-stats">
        <StatCard etiqueta="Ventas de hoy" valor={resumen ? formatoMoneda(resumen.ventas) : '—'} />
        <StatCard etiqueta="Paquetes vendidos" valor={resumen ? String(resumen.paquetes) : '—'} />
        <StatCard etiqueta="Utilidad" valor={resumen ? formatoMoneda(resumen.utilidad) : '—'} />
        <StatCard etiqueta="Pendiente por cobrar" valor={resumen ? formatoMoneda(resumen.pendiente) : '—'} alerta={!!resumen?.pendiente} />
        <StatCard etiqueta="Clientes nuevos" valor={resumen ? String(resumen.clientes_nuevos) : '—'} />
      </section>

      <section className="accesos-rapidos">
        <Link to="/venta-nueva" className="acceso-boton primario">➕ Nueva venta</Link>
        <Link to="/clientes?nuevo=1" className="acceso-boton">👤 Nuevo cliente</Link>
        <Link to="/rutas" className="acceso-boton">🧭 Rutas</Link>
        <Link to="/clientes" className="acceso-boton">📇 Clientes</Link>
        <Link to="/mapa" className="acceso-boton">📍 Mapa</Link>
        <Link to="/informes" className="acceso-boton">📊 Informes</Link>
        <Link to="/respaldo" className="acceso-boton">💾 Respaldo</Link>
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
