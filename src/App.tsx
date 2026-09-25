import { lazy, Suspense, useEffect, useState } from 'react';
import type { Ruta } from './types';
import PinLock from './components/PinLock';
import { Link, Navigate } from 'react-router-dom';
import { inicializarModulos, listarModulos, obtenerModulo } from './modulos/runtime';
import ModuloErrorBoundary from './modulos/ModuloErrorBoundary';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { database } from './db/database';
import SideNav from './components/SideNav';
import ConfiguracionInicial from './pages/ConfiguracionInicial';
import { aplicarTema } from './utils/theme';
import { fechaLocalISO, formatoFecha } from './utils/format';
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

const DB_INIT_TIMEOUT_MS = 60_000;

function duracionRuta(fecha: string, hora: string, ahora = Date.now()): string {
  const inicio = new Date(fecha + 'T' + hora + ':00-05:00').getTime();
  const minutos = Math.max(0, Math.floor((ahora - inicio) / 60000));
  return String(Math.floor(minutos / 60)).padStart(2, '0') + ':' + String(minutos % 60).padStart(2, '0');
}

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

function ModuloRoute({ id }: { id: string }) {
  const modulo = obtenerModulo(id);
  const [habilitado,setHabilitado] = useState<boolean | null>(null);
  const [contexto,setContexto] = useState<Awaited<ReturnType<typeof database.crearContextoModulo>> | null>(null);

  useEffect(() => {
    let activo=true;
    Promise.all([database.obtenerModuloHabilitado(id),database.crearContextoModulo(id)])
      .then(([enabled,ctx]) => { if(activo){setHabilitado(enabled);setContexto(ctx);} })
      .catch(() => { if(activo)setHabilitado(false); });
    return()=>{activo=false;};
  },[id]);

  if (!modulo || habilitado === false) return <Navigate to="/" replace />;
  if (habilitado === null || !contexto) return <CargandoPagina />;
  return (
    <ModuloErrorBoundary modulo={modulo} contexto={contexto}>
      <modulo.Componente contexto={contexto} />
    </ModuloErrorBoundary>
  );
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
  const [rutaActiva, setRutaActiva] = useState<Ruta | null>(null);
  const [rutaAviso12h, setRutaAviso12h] = useState(false);
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());

  useEffect(() => {
    let activo = true;
    const cargarRuta = async () => {
      try {
        const ruta = await database.obtenerRutaActiva();
        if (!activo) return;
        setRutaActiva(ruta);
        if (ruta?.fecha && ruta.hora_inicio) {
          const inicio = new Date(ruta.fecha + 'T' + ruta.hora_inicio + ':00-05:00');
          const supera = Date.now() - inicio.getTime() >= 12 * 60 * 60 * 1000;
          if (supera) {
            const clave = 'camello.ruta12h.' + ruta.id;
            if (sessionStorage.getItem(clave) !== '1') {
              sessionStorage.setItem(clave, '1');
              setRutaAviso12h(true);
            }
          }
        }
      } catch {
        // El banner nunca bloquea la navegación.
      }
    };
    void cargarRuta();
    const intervalo = window.setInterval(() => void cargarRuta(), 30000);
    const reloj = window.setInterval(() => setAhoraMs(Date.now()), 1000);
    return () => { activo = false; window.clearInterval(intervalo); window.clearInterval(reloj); };
  }, [location.pathname]);

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
      {rutaActiva && (
        <Link to={`/rutas/${rutaActiva.id}`} className="banner-ruta-activa banner-ruta-global">
          🧭 Ruta en curso: {rutaActiva.nombre} · {rutaActiva.hora_inicio} · {rutaActiva.hora_inicio ? duracionRuta(rutaActiva.fecha, rutaActiva.hora_inicio, ahoraMs) : '00:00'} · paquetes {rutaActiva.paquetes_llevados}
        </Link>
      )}
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
            {listarModulos().map((modulo) => <Route key={modulo.id} path={modulo.ruta} element={<ModuloRoute id={modulo.id} />} />)}
            <Route path="*" element={<Dashboard config={config} />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
      {rutaAviso12h && rutaActiva && (
        <div className="modal-flotante" role="dialog" aria-modal="true" aria-label="Ruta en curso por más de 12 horas">
          <div className="tarjeta">
            <p className="texto-kicker">Ruta activa</p>
            <h2>¿Sigues en ruta?</h2>
            <p>La ruta “{rutaActiva.nombre}” empezó el {formatoFecha(rutaActiva.fecha)} a las {rutaActiva.hora_inicio} y lleva más de 12 horas. No se cerrará automáticamente.</p>
            <button type="button" className="boton-primario" onClick={() => setRutaAviso12h(false)}>Sí, sigo en ruta</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [listo, setListo] = useState(false);
  const [config, setConfig] = useState<ConfiguracionApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desbloqueado,setDesbloqueado]=useState(false);
  const [seguridadPin,setSeguridadPin]=useState({habilitado:false,lock_minutos:5});
  const [bloqueadoPorInactividad,setBloqueadoPorInactividad]=useState(false);

  useEffect(() => {
    let ocultoDesde=0;
    const onVis=()=>{if(document.visibilityState==='hidden') ocultoDesde=Date.now(); else if(ocultoDesde&&seguridadPin.habilitado&&Date.now()-ocultoDesde>=seguridadPin.lock_minutos*60000){setBloqueadoPorInactividad(true);setDesbloqueado(false);}};
    document.addEventListener('visibilitychange',onVis);
    return()=>document.removeEventListener('visibilitychange',onVis);
  },[seguridadPin]);

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
        await database.verificarSalud();
        const ultimaSalud = localStorage.getItem('camello.ultimaSaludBd');
        if (!ultimaSalud || Date.now() - Number(ultimaSalud) >= 7 * 24 * 60 * 60 * 1000) {
          await database.verificarSalud();
          localStorage.setItem('camello.ultimaSaludBd', String(Date.now()));
        }
        await inicializarModulos(database);
        const seguridad = await database.obtenerSeguridadPin();
        if (activo) { setSeguridadPin({habilitado:seguridad.habilitado,lock_minutos:seguridad.lock_minutos}); setDesbloqueado(!seguridad.habilitado); }
        if (import.meta.env.VITE_E2E === '1') {
          window.__CAMELLO_TEST_SQL__ = async (sql, params = []) => {
            const r = await database.connForTesting(sql, params);
            return r;
          };
        }
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

  if(seguridadPin.habilitado&&(!desbloqueado||bloqueadoPorInactividad)) return <PinLock onDesbloqueado={()=>{setDesbloqueado(true);setBloqueadoPorInactividad(false);}} />;
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
