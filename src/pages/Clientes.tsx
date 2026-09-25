import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import ClienteForm from '../components/ClienteForm';
import { database } from '../db/database';
import type { ClienteConResumen, ResumenClientes } from '../types';
import { formatoMoneda } from '../utils/format';

const ETIQUETA_SEGUIMIENTO: Record<string, string> = {
  ACTIVO: 'Activo',
  POR_CONTACTAR: 'Por contactar',
  INACTIVO: 'Inactivo',
};

const PAGE_SIZE = 50;
type FiltroMetrica = 'monto' | 'sinRecompra' | 'cantidad';

export default function Clientes() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [params] = useSearchParams();
  const [mostrarForm, setMostrarForm] = useState(params.get('nuevo') === '1');
  const [metricas, setMetricas] = useState<ResumenClientes>({
    activos: 0, conDeuda: 0, deudaTotal: 0, sinComprar: 0, nuevosMes: 0,
    ticketPromedio: 0, frecuencia: 20, cumpleanos: 0, mejorMonto: [], mejorFrecuencia: [], mejorCantidad: [], sinRecompra: [],
  });
  const [hayMas, setHayMas] = useState(false);
  const [filtroMetrica, setFiltroMetrica] = useState<FiltroMetrica>('monto');
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const solicitudClientesRef = useRef(0);

  const cargarClientes = useCallback(async (offset: number, agregar: boolean) => {
    const solicitud = ++solicitudClientesRef.current;
    if (agregar) setCargandoMas(true);
    else setCargando(true);
    try {
      const loteCompleto = await database.listarClientes({
        soloActivos: true,
        texto: busqueda,
        limite: PAGE_SIZE + 1,
        offset,
      });
      if (solicitud !== solicitudClientesRef.current) return;
      const lote = loteCompleto.slice(0, PAGE_SIZE);
      setClientes((actual) => agregar ? [...actual, ...lote] : lote);
      setHayMas(loteCompleto.length > PAGE_SIZE);
      setError(null);
    } catch (e: unknown) {
      if (solicitud !== solicitudClientesRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (solicitud !== solicitudClientesRef.current) return;
      if (agregar) setCargandoMas(false);
      else setCargando(false);
    }
  }, [busqueda]);

  const cargarMetricas = useCallback(async () => {
    try {
      const resumen = await database.resumenClientes();
      setMetricas(resumen);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    setClientes([]);
    setHayMas(false);
    void cargarClientes(0, false);
  }, [busqueda, cargarClientes]);

  useEffect(() => {
    void cargarMetricas();
  }, [cargarMetricas]);

  async function recargarDespuesDeGuardar() {
    await Promise.all([cargarClientes(0, false), cargarMetricas()]);
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Clientes</h1>
        <button className="boton-secundario" onClick={() => {
          const siguiente = !mostrarForm;
          setMostrarForm(siguiente);
          navigate(siguiente ? '/clientes?nuevo=1' : '/clientes');
        }}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
        </button>
      </header>

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && (
        <ClienteForm
          textoBoton="Guardar cliente"
          onGuardado={(id) => {
            setMostrarForm(false);
            void recargarDespuesDeGuardar();
            navigate(`/clientes/${id}`);
          }}
          onCancelar={() => { setMostrarForm(false); navigate('/clientes'); }}
        />
      )}

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div><p className="texto-kicker">Métricas</p><h2>Resumen de clientes</h2></div>
        </div>
        <div className="grid-stats">
          <div className="stat-card"><span className="stat-valor">{metricas.activos}</span><span className="stat-etiqueta">Activos</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.conDeuda}</span><span className="stat-etiqueta">Con deuda</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.deudaTotal)}</span><span className="stat-etiqueta">Deuda total</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.sinComprar}</span><span className="stat-etiqueta">Sin comprar +20 días</span></div>
          <div className="stat-card"><span className="stat-valor">{metricas.nuevosMes}</span><span className="stat-etiqueta">Nuevos del mes</span></div>
          <div className="stat-card"><span className="stat-valor">{formatoMoneda(metricas.ticketPromedio)}</span><span className="stat-etiqueta">Ticket promedio</span></div>
          <div className="stat-card"><span className="stat-valor">{Math.round(metricas.frecuencia)} d</span><span className="stat-etiqueta">Frecuencia media</span></div>
        </div>
        <div className="filtros-mapa">
          <button type="button" className={'chip-filtro'+(filtroMetrica==='monto'?' activo':'')} onClick={()=>setFiltroMetrica('monto')}>Mejores clientes</button>
          <button type="button" className={'chip-filtro'+(filtroMetrica==='sinRecompra'?' activo':'')} onClick={()=>setFiltroMetrica('sinRecompra')}>No han vuelto</button>
          <button type="button" className={'chip-filtro'+(filtroMetrica==='cantidad'?' activo':'')} onClick={()=>setFiltroMetrica('cantidad')}>Más cantidad</button>
        </div>
        <div className="metricas-listas">
          {filtroMetrica==='monto' && <div><strong>Mejores clientes por monto comprado</strong><ul>{metricas.mejorMonto.map((c)=><li key={c.id}><span>{c.nombre}</span><strong>{formatoMoneda(c.total_comprado)}</strong></li>)}</ul></div>}
          {filtroMetrica==='sinRecompra' && <div><strong>Clientes que nunca volvieron a comprar</strong><ul>{metricas.sinRecompra.map((c)=><li key={c.id}><span>{c.nombre}</span><strong>{c.ultima_compra??'Sin compras'}</strong></li>)}</ul></div>}
          {filtroMetrica==='cantidad' && <div><strong>Clientes que más piden en cantidad</strong><ul>{metricas.mejorCantidad.map((c)=><li key={c.id}><span>{c.nombre}</span><strong>{c.cantidad} unidades</strong></li>)}</ul></div>}
          <div><strong>Estadísticas generales</strong>
            <div className="grafico-barras">
              <GraficoBarra etiqueta="Activos" valor={metricas.activos} max={Math.max(metricas.activos,1)} />
              <GraficoBarra etiqueta="Con deuda" valor={metricas.conDeuda} max={Math.max(metricas.activos,1)} />
              <GraficoBarra etiqueta="Sin comprar +20 d" valor={metricas.sinComprar} max={Math.max(metricas.activos,1)} />
              <GraficoBarra etiqueta="Nuevos este mes" valor={metricas.nuevosMes} max={Math.max(metricas.activos,1)} />
            </div>
          </div>
          <div><strong>Cumpleaños registrados</strong><p className="texto-vacio">{metricas.cumpleanos} cumpleaños con día y mes guardados.</p></div>
        </div>
      </section>

      <input className="campo-busqueda" placeholder="Buscar por cliente o mascota…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

      {cargando && clientes.length === 0 ? <p className="texto-vacio">Cargando clientes…</p> : (
        <>
          <ul className="lista-clientes">
            {clientes.map((c) => (
              <li key={c.id}>
                <Link to={`/clientes/${c.id}`} className="tarjeta-cliente">
                  <div><strong>{c.nombre}</strong><div className="detalle-cliente">
                    {c.mascotas.length > 0 && <span>{c.mascotas.map((m) => m.nombre).join(', ')} · </span>}
                    {c.ultima_compra ? `Última compra: ${c.ultima_compra}` : 'Sin compras aún'}
                  </div></div>
                  <div className="lado-derecho-cliente">
                    {c.pendiente > 0 && <span className="etiqueta-pendiente">{formatoMoneda(c.pendiente)}</span>}
                    <span className={'etiqueta-seguimiento ' + c.seguimiento.toLowerCase()}>{ETIQUETA_SEGUIMIENTO[c.seguimiento]}</span>
                  </div>
                </Link>
              </li>
            ))}
            {clientes.length === 0 && !error && <p className="texto-vacio">No hay clientes que coincidan con la búsqueda.</p>}
          </ul>
          {hayMas && <div className="fila-titulo-boton">
            <span className="detalle-cliente">Mostrando {clientes.length} cliente(s)</span>
            <button type="button" className="boton-secundario" disabled={cargandoMas} onClick={() => void cargarClientes(clientes.length, true)}>
              {cargandoMas ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>}
        </>
      )}
    </div>
  );
}
function GraficoBarra({ etiqueta, valor, max }: { etiqueta:string; valor:number; max:number }) {
  const porcentaje=Math.max(0,Math.min(100,(valor/max)*100));
  return <div className="grafico-barra-fila"><span>{etiqueta}</span><div className="grafico-barra-pista"><i style={{width:porcentaje+'%'}} /></div><strong>{valor}</strong></div>;
}
