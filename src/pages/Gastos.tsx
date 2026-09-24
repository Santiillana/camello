import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { database } from '../db/database';
import AsistenteTarjetas from '../components/AsistenteTarjetas';
import BorradorPendiente from '../components/BorradorPendiente';
import { useBorrador } from '../hooks/useBorrador';
import { formatoMoneda, hoyISO } from '../utils/format';
import type { CategoriaGasto, Gasto, EstadoGasto, ResultadoMes } from '../types';
import { comprimirArchivo } from '../components/FotosSelector';

function esEstadoGasto(value: string): value is EstadoGasto {
  return value === 'pagado' || value === 'pendiente' || value === 'anulado';
}
function esNaturalezaGasto(value: string): value is 'operativo' | 'compra_insumos' | 'retiro_dueno' {
  return value === 'operativo' || value === 'compra_insumos' || value === 'retiro_dueno';
}

type FiltroPeriodo='hoy'|'semana'|'mes';
function inicioSemana(fecha:string){ const d=new Date(fecha+'T00:00:00Z'); const n=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()-(n-1)); return d.toISOString().slice(0,10); }
function inicioMes(fecha:string){ return fecha.slice(0,7)+'-01'; }

export default function Gastos(){
  const [params,setParams]=useSearchParams();
  const [gastos,setGastos]=useState<Gasto[]>([]);
  const [categorias,setCategorias]=useState<CategoriaGasto[]>([]);
  const [filtro,setFiltro]=useState<FiltroPeriodo>('mes');
  const [categoriaId,setCategoriaId]=useState('');
  const [estado,setEstado]=useState<EstadoGasto|''>('');
  const [mostrar,setMostrar]=useState(params.get('nuevo')==='1');
  const [error,setError]=useState<string|null>(null);
  const [periodo,setPeriodo]=useState<ResultadoMes|null>(null);
  const [gastoEditando,setGastoEditando]=useState<Gasto|null>(null);

  async function cargar(){
    try{
      const hoy=hoyISO();
      const desde=filtro==='hoy'?hoy:filtro==='semana'?inicioSemana(hoy):inicioMes(hoy);
      await database.sincronizarGastosRecurrentes(hoy.slice(0,7));
      const [gs,cs,res]=await Promise.all([
        database.listarGastos({desde,hasta:hoy,categoriaId:categoriaId?Number(categoriaId):undefined,estado:estado||undefined}),
        database.listarCategoriasGasto(),
        database.resultadoMes(hoy.slice(0,7)),
      ]);
      setGastos(gs); setCategorias(cs); setPeriodo(res); setError(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{void cargar();},[filtro,categoriaId,estado]);

  const total=useMemo(()=>gastos.filter(g=>g.estado!=='anulado').reduce((s,g)=>s+g.monto,0),[gastos]);
  return <div className="pantalla">
    <header className="encabezado">
      <div><p className="texto-kicker">Operación</p><h1>Gastos</h1></div>
      <button className="boton-primario" onClick={()=>{setMostrar(true);setParams({nuevo:'1'});}}>+ Nuevo gasto</button>
    </header>
    {gastoEditando&&<EditorGasto gasto={gastoEditando} categorias={categorias} onGuardado={()=>{setGastoEditando(null);void cargar();}} onCancelar={()=>setGastoEditando(null)} />}
    {mostrar&&<FormularioGasto categorias={categorias} onCategoriaCreada={async()=>{await cargar();}} onGuardado={()=>{setMostrar(false);setParams({});void cargar();}} onCancelar={()=>{setMostrar(false);setParams({});}} />}
    <section className="periodo-selector">{(['hoy','semana','mes'] as const).map((x) =><button key={x} type="button" className={'periodo-tab'+(filtro===x?' activo':'')} onClick={()=>setFiltro(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</section>
    <section className="tarjeta"><div className="fila-titulo-boton"><h2>Total</h2><div className="fila-botones"><strong>{formatoMoneda(total)}</strong><button type="button" className="boton-secundario" onClick={()=>descargarCSV(gastos)}>Exportar CSV</button>
<button type="button" className="boton-secundario" onClick={()=>void compartirCSV(gastos)}>Compartir CSV</button></div></div>
      <div className="grid-dos-columnas">
        <label>Categoría<select value={categoriaId} onChange={e=>setCategoriaId(e.target.value)}><option value="">Todas</option>{categorias.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Estado<select value={estado} onChange={e=>setEstado(e.target.value===''?'':esEstadoGasto(e.target.value)?e.target.value:estado)}><option value="">Todos</option><option value="pagado">Pagado</option><option value="pendiente">Por pagar</option><option value="anulado">Anulado</option></select></label>
      </div>
    </section>
    <section className="tarjeta"><h2>Resultado del mes</h2>{periodo&&<div className="lista-resumen">
      <div><span>Ventas</span><strong>{formatoMoneda(periodo.ventas)}</strong></div>
      <div><span>Costo materia prima</span><strong>{formatoMoneda(periodo.costo_materia_prima)}</strong></div>
      <div><span>Utilidad bruta</span><strong>{formatoMoneda(periodo.utilidad_bruta)}</strong></div>
      <div><span>Gastos operativos</span><strong>{formatoMoneda(periodo.gastos_operativos)}</strong></div>
      <div><span>Utilidad neta</span><strong>{formatoMoneda(periodo.utilidad_neta)}</strong></div>
      <div><span>Flujo de caja</span><strong>{formatoMoneda(periodo.flujo_caja)}</strong></div>
      <div><span>Por pagar</span><strong>{formatoMoneda(periodo.gastos_pendientes)}</strong></div>
    </div>}</section>
    <section className="tarjeta"><h2>Listado</h2>{gastos.length===0?<p className="texto-vacio">No hay gastos en este periodo.</p>:<ul className="lista-resumen">{gastos.map(g=><li key={g.id} className="fila-cartera">
      <div><strong>{g.categoria_nombre}</strong><span>{g.fecha} · {g.estado}{g.estado==='pendiente' && g.fecha_limite ? ' · '+(g.fecha_limite < hoyISO() ? 'Vencido' : 'vence '+g.fecha_limite) : ''}</span><span>{g.proveedor||g.descripcion||'Sin detalle'}</span></div>
      <div className="lado-derecho-cliente"><strong>{formatoMoneda(g.monto)}</strong><button className="boton-chip" onClick={()=>setGastoEditando(g)}>Editar</button>{g.estado==='pendiente'&&<button className="boton-chip" onClick={async()=>{const monto=Number(window.prompt('Monto real pagado',String(g.monto)));if(Number.isInteger(monto)&&monto>0){await database.pagarGasto(g.id,monto,'EFECTIVO');void cargar();}}}>Pagar</button>}<button className="boton-texto" onClick={async()=>{await database.archivarGasto(g.id);void cargar();}}>Archivar</button><button className="boton-texto peligro-texto" onClick={async()=>{const motivo=window.prompt('Motivo de anulación');if(motivo) {await database.anularGastoConMotivo(g.id,motivo);void cargar();}}}>Anular</button></div>
    </li>)}</ul>}</section>
    {error&&<p className="texto-error">{error}</p>}
  </div>
}


async function compartirCSV(items: Gasto[]) {
  const csv = crearCSV(items);
  if (typeof navigator.share !== 'function') {
    descargarCSV(items);
    return;
  }
  const archivo = new File([csv], 'camello-gastos.csv', { type: 'text/csv;charset=utf-8' });
  try {
    await navigator.share({ title: 'Gastos CAMELLO', text: 'Exportación de gastos', files: [archivo] });
  } catch { /* El error de lectura auxiliar no impide continuar con la pantalla de gastos. */ }
}

function crearCSV(items: Gasto[]) {
  const filas=[['fecha','categoria','monto','estado','metodo','proveedor','descripcion'],...items.map(g=>[g.fecha,g.categoria_nombre??'',String(g.monto),g.estado,g.metodo_pago??'',g.proveedor??'',g.descripcion??''])];
  return filas.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n');
}

function descargarCSV(items: Gasto[]) {
  const csv=crearCSV(items);
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='camello-gastos.csv'; a.click(); URL.revokeObjectURL(url);
}

function FormularioGasto({categorias,onCategoriaCreada,onGuardado,onCancelar}:{categorias:CategoriaGasto[];onCategoriaCreada:()=>Promise<void>;onGuardado:()=>void;onCancelar:()=>void}){
  const [monto,setMonto]=useState(''); const [categoria,setCategoria]=useState(''); const [fecha,setFecha]=useState(hoyISO()); const [estado,setEstado]=useState<EstadoGasto>('pagado'); const [metodo,setMetodo]=useState('EFECTIVO'); const [fechaLimite,setFechaLimite]=useState(''); const [nota,setNota]=useState(''); const [proveedor,setProveedor]=useState(''); const [foto,setFoto]=useState(''); const [ruta,setRuta]=useState<number|undefined>();
  const [paso,setPaso]=useState(0); const [guardando,setGuardando]=useState(false);
  const datos={monto,categoria,fecha,estado,metodo,fechaLimite,nota,proveedor,foto,ruta};
  const borrador=useBorrador({tipo:'gasto-nuevo',clave:'nuevo',datos,paso});
  const [pendienteRutas,setPendienteRutas]=useState<{id:number;nombre:string}[]>([]);
  useEffect(()=>{void database.obtenerRutaActiva().then(r=>setPendienteRutas(r?[{id:r.id,nombre:r.nombre}]:[]));},[]);
  const tarjetas=[
    {id:'monto',titulo:'Monto',contenido:<label>Monto<input type="number" min={1} step={1} value={monto} onChange={e=>setMonto(e.target.value)} inputMode="numeric"/></label>,validar:()=>Number.isSafeInteger(Number(monto))&&Number(monto)>0?null:'Escribe un monto entero mayor que 0.'},
    {id:'cat',titulo:'Categoría',contenido:<div className="formulario"><label>Categoría<select value={categoria} onChange={e=>setCategoria(e.target.value)}><option value="">Selecciona</option>{categorias.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><button type="button" className="boton-texto" onClick={async()=>{const nombre=window.prompt('Nombre de la nueva categoría');if(!nombre?.trim())return;const tipo=(window.prompt('Tipo: fijo o variable','variable')==='fijo'?'fijo':'variable');const naturaleza=window.prompt('Naturaleza: operativo, compra_insumos o retiro_dueno','operativo')||'operativo';const id=await database.crearCategoriaGasto({nombre:nombre.trim(),tipo:naturaleza==='operativo'?tipo:(tipo==='fijo'?'fijo':'variable'),naturaleza:esNaturalezaGasto(naturaleza)?naturaleza:'operativo'});await onCategoriaCreada();setCategoria(String(id));}}>+ Nueva categoría</button></div>,validar:()=>categoria?null:'Selecciona una categoría.'},
    {id:'fecha',titulo:'Fecha',contenido:<label>Fecha<input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/></label>},
    {id:'pago',titulo:'Estado del pago',contenido:<div className="fila-botones"><button type="button" className={'boton-chip'+(estado==='pagado'?' activo':'')} onClick={()=>setEstado('pagado')}>Ya pagué</button><button type="button" className={'boton-chip'+(estado==='pendiente'?' activo':'')} onClick={()=>setEstado('pendiente')}>Por pagar</button></div>},
    {id:'metodo',titulo:'Método',opcional:estado!=='pagado',contenido:<select value={metodo} onChange={e=>setMetodo(e.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Otro</option></select>},
    {id:'limite',titulo:'Fecha límite',opcional:estado!=='pendiente',contenido:<input type="date" value={fechaLimite} onChange={e=>setFechaLimite(e.target.value)}/>},
    {id:'detalle',titulo:'Nota / proveedor',opcional:true,contenido:<div className="formulario"><label>Nota<textarea value={nota} onChange={e=>setNota(e.target.value)}/></label><label>Proveedor<input value={proveedor} onChange={e=>setProveedor(e.target.value)}/></label></div>},
    {id:'foto',titulo:'Foto del recibo',opcional:true,contenido:<input type="file" accept="image/*" capture="environment" onChange={async e=>{const f=e.target.files?.[0];if(f)setFoto(await comprimirArchivo(f));}}/>},
    {id:'ruta',titulo:'Asociar a ruta',opcional:true,contenido:pendienteRutas.length>0?<label><input type="checkbox" checked={ruta!=null} onChange={e=>setRuta(e.target.checked?pendienteRutas[0].id:undefined)}/> {pendienteRutas[0].nombre}</label>:<p className="texto-vacio">No hay ruta en curso.</p>},
    {id:'confirmar',titulo:'Confirmar gasto',contenido:<div className="lista-resumen"><div><span>Monto</span><strong>{monto?formatoMoneda(Number(monto)):'-'}</strong></div><div><span>Categoría</span><strong>{categorias.find(c=>String(c.id)===categoria)?.nombre||'-'}</strong></div><div><span>Estado</span><strong>{estado}</strong></div></div>}
  ];
  async function guardar(){if(guardando)return;setGuardando(true);try{await database.crearGasto({fecha,monto:Number(monto),categoria_id:Number(categoria),descripcion:nota,metodo_pago:estado==='pagado'?metodo:undefined,estado,fecha_limite:fechaLimite||undefined,proveedor,ruta_id:ruta,foto_ref:foto||undefined,operacion_id:'gasto-'+Date.now()});await borrador.limpiar();onGuardado();}finally{setGuardando(false);}}
  return <>{borrador.pendiente&&<BorradorPendiente fecha={borrador.pendiente.updated_at} onDescartar={()=>void borrador.descartar()} onContinuar={async()=>{const p=borrador.pendiente;if(!p)return;const paso=await borrador.continuar();
            setMonto(p.datos.monto);setCategoria(p.datos.categoria);setFecha(p.datos.fecha);
            setEstado(p.datos.estado);setMetodo(p.datos.metodo);setFechaLimite(p.datos.fechaLimite);
            setNota(p.datos.nota);setProveedor(p.datos.proveedor);setFoto(p.datos.foto);setRuta(p.datos.ruta);setPaso(paso);}}/>}<AsistenteTarjetas titulo="Nuevo gasto" tarjetas={tarjetas} onCompletar={guardar} onCancelar={onCancelar} textoFinal={guardando?'Guardando…':'CONFIRMAR GASTO'} pasoInicial={paso} onPasoChange={setPaso} onGuardarBorrador={borrador.guardarAhora} onDescartarBorrador={borrador.descartar}/></>
}

function EditorGasto({gasto,categorias,onGuardado,onCancelar}:{gasto:Gasto;categorias:CategoriaGasto[];onGuardado:()=>void;onCancelar:()=>void}){
  const [monto,setMonto]=useState(String(gasto.monto));const [categoria,setCategoria]=useState(String(gasto.categoria_id));const [fecha,setFecha]=useState(gasto.fecha);const [nota,setNota]=useState(gasto.descripcion??'');const [proveedor,setProveedor]=useState(gasto.proveedor??'');const [limite,setLimite]=useState(gasto.fecha_limite??'');
  const [paso,setPaso]=useState(0);
  const tarjetas=[
    {id:'monto',titulo:'Monto',contenido:<input type="number" min={1} value={monto} onChange={e=>setMonto(e.target.value)}/>},
    {id:'categoria',titulo:'Categoría',contenido:<select value={categoria} onChange={e=>setCategoria(e.target.value)}>{categorias.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select>},
    {id:'fecha',titulo:'Fecha',contenido:<input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>},
    {id:'detalle',titulo:'Detalle',contenido:<div className="formulario"><label>Nota<textarea maxLength={500} value={nota} onChange={e=>setNota(e.target.value)}/></label><label>Proveedor<input maxLength={160} value={proveedor} onChange={e=>setProveedor(e.target.value)}/></label><label>Fecha límite<input type="date" value={limite} onChange={e=>setLimite(e.target.value)}/></label></div>},
    {id:'confirmar',titulo:'Confirmar',contenido:<div className="lista-resumen"><div><span>Monto</span><strong>{formatoMoneda(Number(monto))}</strong></div><div><span>Categoría</span><strong>{categorias.find(c=>String(c.id)===categoria)?.nombre}</strong></div></div>},
  ];
  async function guardar(){await database.editarGasto(gasto.id,{monto:Number(monto),categoria_id:Number(categoria),fecha,descripcion:nota,proveedor,fecha_limite:limite||null});onGuardado();}
  return <AsistenteTarjetas titulo="Editar gasto" tarjetas={tarjetas} onCompletar={guardar} onCancelar={onCancelar} pasoInicial={paso} onPasoChange={setPaso} textoFinal="Guardar cambios"/>;
}
