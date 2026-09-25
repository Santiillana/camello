import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { database } from '../db/database';
import type { ClienteConResumen, PedidoConDetalle, RutaConResumen, Venta } from '../types';
import { formatoFecha, formatoMoneda } from '../utils/format';

export default function RutaDetalle() {
  const { id } = useParams();
  const rutaId = Number(id);
  const navigate = useNavigate();
  const [ruta, setRuta] = useState<RutaConResumen | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pedidos, setPedidos] = useState<PedidoConDetalle[]>([]);
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<{lat:number;lng:number}|null>(null);
  const [procesandoPedido, setProcesandoPedido] = useState<number | null>(null);
  const [sobrantes, setSobrantes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const mapaRef = useRef<L.Map | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);
  const usuarioRef = useRef<L.CircleMarker | null>(null);

  async function cargar() {
    if (!Number.isInteger(rutaId) || rutaId <= 0) { setError('Ruta inválida.'); return; }
    try {
      const [rutas, vs, ps, cs] = await Promise.all([
        database.listarRutas(), database.listarVentasPorRuta(rutaId),
        database.listarPedidos({ rutaId }), database.listarClientes({ soloActivos: true, limite: 2000 }),
      ]);
      const r = rutas.find((x) => x.id === rutaId) ?? null;
      setRuta(r); setVentas(vs); setPedidos(ps); setClientes(cs);
      if (r) setSobrantes(String(r.paquetes_sobrantes ?? Math.max(r.paquetes_llevados - r.vendidos, 0)));
      if (!r) setError('No se encontró la ruta.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }
  useEffect(() => { void cargar(); }, [rutaId]);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([4.142, -73.6266], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(mapa);
    capaRef.current = L.layerGroup().addTo(mapa); mapaRef.current = mapa;
    const resize=()=>mapa.invalidateSize({pan:false});
    window.setTimeout(resize,0); window.setTimeout(resize,250);
    return()=>{ capaRef.current?.clearLayers(); capaRef.current=null; mapa.remove(); mapaRef.current=null; };
  }, []);

  useEffect(() => {
    if (!capaRef.current || !mapaRef.current) return;
    capaRef.current.clearLayers();
    const ordered=[...pedidos].filter(p=>p.estado!=='CANCELADO').sort((a,b)=>Number(a.orden_entrega??0)-Number(b.orden_entrega??0));
    const points=ordered.map((p,index)=>{
      const c=clientes.find(x=>x.id===p.cliente_id);
      return c?.lat!=null&&c.lng!=null ? {p,c,index} : null;
    }).filter((x):x is {p:PedidoConDetalle;c:ClienteConResumen;index:number}=>x!==null);
    if (!points.length) return;
    const bounds:L.LatLngExpression[]=[];
    points.forEach(({p,c,index})=>{
      const active=p.id===seleccionado;
      const marker=L.circleMarker([c.lat!,c.lng!],{radius:active?14:9,color:active?'#111':'#c2642b',fillColor:active?'#111':'#c2642b',fillOpacity:.88,weight:3});
      marker.bindTooltip(String(index+1),{permanent:true,direction:'center',className:'mapa-numero-parada'});
      marker.bindPopup(c.nombre+' · '+p.items.map(i=>i.producto_nombre+' × '+i.cantidad).join(', '));
      marker.on('click',()=>setSeleccionado(p.id));
      marker.addTo(capaRef.current!); bounds.push([c.lat!,c.lng!]);
    });
    if (bounds.length) mapaRef.current.fitBounds(bounds as L.LatLngBoundsExpression,{padding:[24,24],maxZoom:16});
  }, [pedidos,clientes,seleccionado]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const idWatch=navigator.geolocation.watchPosition(pos=>{
      const value={lat:pos.coords.latitude,lng:pos.coords.longitude}; setMiUbicacion(value);
      if (!usuarioRef.current && mapaRef.current) usuarioRef.current=L.circleMarker([value.lat,value.lng],{radius:7,color:'#111',fillColor:'#fff',fillOpacity:1,weight:3}).addTo(mapaRef.current);
      else usuarioRef.current?.setLatLng([value.lat,value.lng]);
    },()=>undefined,{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    return()=>navigator.geolocation.clearWatch(idWatch);
  }, []);

  async function entregar(pedidoId:number, metodo:'EFECTIVO'|'TRANSFERENCIA_NEQUI'|'FIADO') {
    setProcesandoPedido(pedidoId); setError(null);
    try { await database.registrarEntregaPedido(pedidoId,metodo); await cargar(); }
    catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
    finally{setProcesandoPedido(null);}
  }

  async function mover(pedidoId:number, delta:number) {
    const orden=[...pedidos].filter(p=>p.estado==='ASIGNADO').sort((a,b)=>Number(a.orden_entrega??0)-Number(b.orden_entrega??0));
    const idx=orden.findIndex(p=>p.id===pedidoId); const target=idx+delta;
    if(idx<0||target<0||target>=orden.length)return;
    [orden[idx],orden[target]]=[orden[target],orden[idx]];
    try { await database.reordenarPedidosDeRuta(rutaId,orden.map(p=>p.id)); await cargar(); }
    catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
  }

  async function finalizar() {
    setProcesando(true); setError(null);
    try {
      let lat:number|undefined; let lng:number|undefined;
      if(navigator.geolocation){try{const pos=await new Promise<GeolocationPosition>((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,maximumAge:0,timeout:10000}));lat=pos.coords.latitude;lng=pos.coords.longitude;}catch{}}
      await database.finalizarRuta(rutaId,{lat_fin:lat,lng_fin:lng,paquetes_sobrantes:Number(sobrantes)});
      await cargar();
    } catch(e:unknown){setError(e instanceof Error?e.message:String(e));} finally{setProcesando(false);}
  }

  if(!ruta&&!error)return <div className="pantalla">Cargando…</div>;
  if(!ruta)return <div className="pantalla"><p className="texto-error">{error}</p><button className="enlace-volver" onClick={()=>navigate('/rutas')}>← Volver a rutas</button></div>;

  const enCurso=ruta.estado==='EN_CURSO';
  const pedidosOrdenados=[...pedidos].sort((a,b)=>Number(a.orden_entrega??9999)-Number(b.orden_entrega??9999));
  const pendientesEntrega=pedidos.some(p=>p.estado==='ASIGNADO');
  const disponibles=Math.max(ruta.paquetes_llevados-ruta.vendidos,0);
  const diferencia=ruta.paquetes_llevados-ruta.vendidos-Number(sobrantes||0);
  const totalRuta=ventas.reduce((s,v)=>s+v.total,0);
  const cobrado=ventas.reduce((s,v)=>s+Number(v.monto_pagado??0),0);
  const fiado=ventas.reduce((s,v)=>s+Math.max(0,v.total-Number(v.monto_pagado??0)),0);
  const materiaPrima=ventas.reduce((s,v)=>s+(v.costo_aplicado*v.cantidad),0);
  const utilidad=ventas.reduce((s,v)=>s+v.utilidad,0);

  return <div className="pantalla">
    <button className="enlace-volver" onClick={()=>navigate(-1)}>← Volver</button>
    <header className="encabezado"><div><p className="texto-kicker">Ruta · {formatoFecha(ruta.fecha)}</p><h1>{ruta.nombre||ruta.tipo}</h1></div><span className={'etiqueta-seguimiento '+(enCurso?'activo':'inactivo')}>{enCurso?'En curso':ruta.estado==='FINALIZADA'?'Finalizada':ruta.estado}</span></header>
    {error&&<p className="texto-error" role="alert">{error}</p>}

    <section className="grid-stats">
      <StatCard etiqueta="Pedidos" valor={String(pedidos.length)} />
      <StatCard etiqueta="Entregados" valor={String(pedidos.filter(p=>p.estado==='ENTREGADO').length)} />
      <StatCard etiqueta="Pendientes" valor={String(pedidos.filter(p=>p.estado==='ASIGNADO').length)} />
      <StatCard etiqueta="Total a cobrar" valor={formatoMoneda(totalRuta)} />
      <StatCard etiqueta="Cobrado" valor={formatoMoneda(cobrado)} />
      <StatCard etiqueta="Fiado" valor={formatoMoneda(fiado)} alerta={fiado>0} />
      <StatCard etiqueta="Materia prima" valor={formatoMoneda(materiaPrima)} />
      <StatCard etiqueta="Utilidad" valor={formatoMoneda(utilidad)} />
    </section>

    <section className="tarjeta">
      <div className="fila-titulo-boton"><div><p className="texto-kicker">Planificación y seguimiento</p><h2>Paradas</h2></div><Link className="boton-secundario" to="/pedidos">+ Nuevo pedido</Link></div>
      {pedidosOrdenados.length===0?<p className="texto-vacio">No hay pedidos asociados a esta ruta.</p>:<ol className="lista-seleccion-clientes">
        {pedidosOrdenados.map((p,index)=><li key={p.id} className={'pedido-entrega-card'+(seleccionado===p.id?' seleccionado':'')} onClick={()=>setSeleccionado(p.id)}>
          <div><strong>{index+1}. {p.cliente_nombre}</strong><span>{p.items.map(i=>i.producto_nombre+' × '+i.cantidad).join(', ')}</span><span>{formatoMoneda(p.total_estimado)} · {p.estado==='ASIGNADO'?'Pendiente':p.estado==='ENTREGADO'?(p.pago_estado==='FIADO'?'Fiado':'Cobrado'):'No entregado'}</span></div>
          <div className="fila-botones">
            {enCurso&&p.estado==='ASIGNADO'&&<><button className="boton-chip" disabled={procesandoPedido===p.id} onClick={(e)=>{e.stopPropagation();void entregar(p.id,'EFECTIVO')}}>Efectivo</button><button className="boton-chip" disabled={procesandoPedido===p.id} onClick={(e)=>{e.stopPropagation();void entregar(p.id,'TRANSFERENCIA_NEQUI')}}>Transferencia</button><button className="boton-chip" disabled={procesandoPedido===p.id} onClick={(e)=>{e.stopPropagation();void entregar(p.id,'FIADO')}}>Fiado</button><button className="boton-texto" onClick={(e)=>{e.stopPropagation();void mover(p.id,-1)}}>↑</button><button className="boton-texto" onClick={(e)=>{e.stopPropagation();void mover(p.id,1)}}>↓</button></>}
          </div>
        </li>)}
      </ol>}
    </section>

    <section className="tarjeta"><div className="fila-titulo-boton"><div><p className="texto-kicker">Mapa integrado</p><h2>Paradas y ubicación actual</h2></div><span className="detalle-cliente">{miUbicacion?'GPS activo':'Buscando GPS…'}</span></div><div ref={contenedorRef} className="contenedor-mapa mapa-vectorial-local ruta-mapa-integrado" /></section>

    <section className="tarjeta"><div className="fila-titulo-boton"><div><p className="texto-kicker">Cuadre</p><h2>Inventario de ruta</h2></div><span className={'etiqueta-estado'+(diferencia===0?'':' pendiente')}>{diferencia}</span></div>
      <div className="lista-resumen"><div><span>Llevados</span><strong>{ruta.paquetes_llevados}</strong></div><div><span>Vendidos</span><strong>{ruta.vendidos}</strong></div><div><span>Sobrantes</span><strong>{sobrantes||'0'}</strong></div><div><span>Diferencia</span><strong>{diferencia}</strong></div></div>
      {enCurso&&<><label>Paquetes sobrantes<input type="number" min={0} max={disponibles} step={1} value={sobrantes} onChange={e=>setSobrantes(e.target.value)} /></label><button className="boton-peligro" onClick={()=>void finalizar()} disabled={procesando||diferencia!==0||pendientesEntrega}>{procesando?'Finalizando…':pendientesEntrega?'Resuelve los pedidos antes de cerrar':'Cerrar ruta y cuadrar'}</button></>}
    </section>
  </div>;
}

function StatCard({etiqueta,valor,alerta}:{etiqueta:string;valor:string;alerta?:boolean}) {
  return <div className={'stat-card'+(alerta?' alerta':'')}><span className="stat-valor">{valor}</span><span className="stat-etiqueta">{etiqueta}</span></div>;
}
