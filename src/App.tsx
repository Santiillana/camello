import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { database } from './db/database';
import BottomNav from './components/BottomNav';
import SideNav from './components/SideNav';
import ConfiguracionInicial from './pages/ConfiguracionInicial';
import { aplicarTema } from './utils/theme';
import { fechaLocalISO } from './utils/format';
import { guardarRespaldoAutomatico, necesitaRespaldoAutomatico } from './utils/respaldoAutomatico';
import type { ConfiguracionApp } from './types';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Clientes = lazy(() => import('./pages/Clientes'));
const ClienteDetalle = lazy(() => import('./pages/ClienteDetalle'));
const NuevaVenta = lazy(() => import('./pages/NuevaVenta'));
const Rutas = lazy(() => import('./pages/Rutas'));
const RutaDetalle = lazy(() => import('./pages/RutaDetalle'));
const Mapa = lazy(() => import('./pages/Mapa'));
const Informes = lazy(() => import('./pages/Informes'));
const Cartera = lazy(() => import('./pages/Cartera'));
const Respaldo = lazy(() => import('./pages/Respaldo'));
const Recordatorios = lazy(() => import('./pages/Recordatorios'));
const Gastos = lazy(() => import('./pages/Gastos'));
const Configuracion = lazy(() => import('./pages/Configuracion'));

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

function CargandoPagina() {
  return <div className="pantalla"><p className="texto-vacio">Cargando…</p></div>;
}

function NavegacionShell({ config, onConfigChanged }: { config: ConfiguracionApp; onConfigChanged: (config: ConfiguracionApp) => void }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuExpandido, setMenuExpandido] = useState(() => localStorage.getItem('camello.menuExpandido') === '1');

  useEffect(() => {
    localStorage.setItem('camello.menuExpandido', menuExpandido ? '1' : '0');
  }, [menuExpandido]);
  const location = useLocation();
  const navigate = useNavigate();
  const esInicio = location.pathname === '/';

  return (
    <div className="app-shell">
      <SideNav
        abierto={menuAbierto || menuExpandido}
        expandido={menuExpandido}
        onCerrar={() => {
          setMenuAbierto(false);
          setMenuExpandido(false);
        }}
        onAlternarExpandido={() => setMenuExpandido((valor) => !valor)}
      />
      <header className="app-topbar">
        {!esInicio ? (
          <button type="button" className="app-topbar-boton" aria-label="Volver" onClick={() => navigate(-1)}>
            ←
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="app-topbar-menu" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>
          ☰
        </button>
      </header>
      <main className="app-contenido">
        <Suspense fallback={<CargandoPagina />}>
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
            <Route path="/gastos" element={<Gastos />} />
            <Route path="/configuracion" element={<Configuracion onConfigChanged={onConfigChanged} />} />
            <Route path="/respaldo" element={<Respaldo />} />
            <Route path="*" element={<Dashboard config={config} />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const [listo, setListo] = useState(false);
  const [config, setConfig] = useState<ConfiguracionApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return undefined;
    const actualizarAltura = () => {
      document.documentElement.style.setProperty('--camello-vvh', visualViewport.height + 'px');
    };
    actualizarAltura();
    visualViewport.addEventListener('resize', actualizarAltura);
    visualViewport.addEventListener('scroll', actualizarAltura);
    return () => {
      visualViewport.removeEventListener('resize', actualizarAltura);
      visualViewport.removeEventListener('scroll', actualizarAltura);
      document.documentElement.style.removeProperty('--camello-vvh');
    };
  }, []);

  useEffect(() => {
    let activo = true;

    if (import.meta.env.VITE_UI_SMOKE === '1') {
      const configPrueba: ConfiguracionApp = {
        negocio_nombre: 'CAMELLO',
        usuario_nombre: 'Prueba',
        color_acento: '#c2642b',
        moneda: 'COP',
      };
      setConfig(configPrueba);
      aplicarTema(configPrueba.color_acento);
      setListo(true);
      return () => { activo = false; };
    }

    inicializarBaseDeDatosConTimeout()
      .then(async () => {
        const resultado = await database.obtenerConfiguracion();
        if (import.meta.env.VITE_E2E === '1' && !resultado.negocio_nombre) {
          await database.guardarConfiguracionInicial(
            { negocio_nombre: 'CAMELLO E2E', usuario_nombre: 'Prueba', color_acento: '#c2642b' },
            { nombre: 'Galletas E2E', precio: 13000, costo: 7000 },
          );
          return database.obtenerConfiguracion();
        }
        return resultado;
      })
      .then((resultado) => {
        if (!activo) return;
        setConfig(resultado);
        aplicarTema(resultado.color_acento);
        setListo(true);
        void database.sincronizarGastosRecurrentes(fechaLocalISO().slice(0, 7)).catch(() => undefined);
        void necesitaRespaldoAutomatico()
          .then((necesario) => necesario ? database.exportarRespaldo().then((respaldo) => guardarRespaldoAutomatico(respaldo)) : undefined)
          .catch(() => {
            // El respaldo automático nunca debe impedir abrir CAMELLO.
          });
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
      <NavegacionShell
        config={config}
        onConfigChanged={(resultado) => {
          setConfig(resultado);
          aplicarTema(resultado.color_acento);
        }}
      />
    </HashRouter>
  );
}
