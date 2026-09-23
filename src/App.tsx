import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { database } from './db/database';
import BottomNav from './components/BottomNav';
import ConfiguracionInicial from './pages/ConfiguracionInicial';
import Configuracion from './pages/Configuracion';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import ClienteDetalle from './pages/ClienteDetalle';
import NuevaVenta from './pages/NuevaVenta';
import Rutas from './pages/Rutas';
import RutaDetalle from './pages/RutaDetalle';
import Mapa from './pages/Mapa';
import Informes from './pages/Informes';
import Cartera from './pages/Cartera';
import Respaldo from './pages/Respaldo';
import Recordatorios from './pages/Recordatorios';
import { aplicarTema } from './utils/theme';
import type { ConfiguracionApp } from './types';

const DB_INIT_TIMEOUT_MS = 15_000;

function inicializarBaseDeDatosConTimeout(): Promise<void> {
  let timer: number | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(
        'La base de datos tardó más de ' + (DB_INIT_TIMEOUT_MS / 1000) + ' segundos en inicializarse.',
      ));
    }, DB_INIT_TIMEOUT_MS);
  });

  return Promise.race([database.init(), timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

export default function App() {
  const [listo, setListo] = useState(false);
  const [config, setConfig] = useState<ConfiguracionApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    inicializarBaseDeDatosConTimeout()
      .then(() => database.obtenerConfiguracion())
      .then((resultado) => {
        if (!activo) return;
        setConfig(resultado);
        aplicarTema(resultado.color_acento);
        setListo(true);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : String(e));
      });

    return () => { activo = false; };
  }, []);

  if (error) {
    return (
      <div className="pantalla-carga">
        <strong>No se pudo abrir la base de datos.</strong>
        <p className="texto-error">{error}</p>
        <button className="boton-secundario" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!listo || !config) {
    return (
      <div className="pantalla-carga">
        <strong>Cargando CAMELLO…</strong>
        <p>Preparando la base de datos local.</p>
      </div>
    );
  }

  if (!config.negocio_nombre || !config.usuario_nombre) {
    return (
      <ConfiguracionInicial
        onCompletada={(resultado) => {
          setConfig(resultado);
          aplicarTema(resultado.color_acento);
        }}
      />
    );
  }

  return (
    <HashRouter>
      <div className="app-shell">
        <main className="app-contenido">
          <Routes>
            <Route path="/" element={<Dashboard config={config} />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<ClienteDetalle />} />
            <Route path="/venta-nueva" element={<NuevaVenta />} />
            <Route path="/rutas" element={<Rutas />} />
            <Route path="/rutas/:id" element={<RutaDetalle />} />
            <Route path="/mapa" element={<Mapa />} />
            <Route path="/informes" element={<Informes />} />
            <Route path="/cartera" element={<Cartera />} />
            <Route path="/recordatorios" element={<Recordatorios />} />
            <Route path="/configuracion" element={<Configuracion onConfigChanged={(resultado) => {
              setConfig(resultado);
              aplicarTema(resultado.color_acento);
            }} />} />
            <Route path="/respaldo" element={<Respaldo />} />
            <Route path="*" element={<Dashboard config={config} />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  );
}
