import { useEffect, useState } from 'react';
import { database } from '../db/database';
import type { GastoPersonal } from '../types';
import { formatoMoneda, hoyISO } from '../utils/format';

type CategoriaPersonal={id:number;nombre:string;tipo:'fijo'|'variable';activa:0|1};

export default function GastosPersonales(){
  const [gastos,setGastos]=useState<GastoPersonal[]>([]);
  const [categorias,setCategorias]=useState<CategoriaPersonal[]>([]);
  const [fecha,setFecha]=useState(hoyISO());
  const [monto,setMonto]=useState('');
  const [categoriaId,setCategoriaId]=useState('');
  const [tipo,setTipo]=useState<'fijo'|'variable'>('variable');
  const [descripcion,setDescripcion]=useState('');
  const [estado,setEstado]=useState<'pagado'|'pendiente'>('pagado');
  const [mostrarCategoria,setMostrarCategoria]=useState(false);
  const [nuevaCategoria,setNuevaCategoria]=useState('');
  const [nuevoTipo,setNuevoTipo]=useState<'fijo'|'variable'>('variable');
  const [resumen,setResumen]=useState<{total:number;pagados:number;pendientes:number;fijos:number;variables:number}|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [guardando,setGuardando]=useState(false);

  async function cargar(){
    try{
      const desde=fecha.slice(0,7)+'-01';
      const [gs,cs,r]=await Promise.all([
        database.listarGastosPersonales({desde,hasta:fecha}),
        database.listarCategoriasGastosPersonales(),
        database.resumenGastosPersonales(desde,fecha),
      ]);
      setGastos(gs);setCategorias(cs);setResumen(r);setError(null);
    }catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{void cargar();},[fecha]);

  async function guardar(){
    if(guardando)return;
    if(!categoriaId){setError('Selecciona una categoría personal.');return;}
    const valor=Number(monto);
    if(!Number.isSafeInteger(valor)||valor<=0){setError('Escribe un monto entero mayor que 0.');return;}
    setGuardando(true);setError(null);
    try{
      await database.crearGastoPersonal({fecha,monto:valor,categoria_id:Number(categoriaId),descripcion,estado});
      setMonto('');setDescripcion('');await cargar();
    }catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
    finally{setGuardando(false);}
  }

  async function crearCategoria(){
    if(!nuevaCategoria.trim()){setError('Escribe el nombre de la categoría.');return;}
    try{
      const id=await database.crearCategoriaGastoPersonal(nuevaCategoria,nuevoTipo);
      setNuevaCategoria('');setMostrarCategoria(false);await cargar();setCategoriaId(String(id));
    }catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
  }

  return <div className="pantalla">
    <header className="encabezado">
      <div><p className="texto-kicker">Finanzas personales</p><h1>Gastos personales</h1></div>
    </header>

    <section className="tarjeta">
      <p className="texto-vacio">Este módulo está separado de la empresa. Nada de aquí entra en ventas, costos, utilidad, cartera o flujo de caja del negocio.</p>
      {resumen&&<div className="grid-stats">
        <div className="stat-card"><span className="stat-valor">{formatoMoneda(resumen.total)}</span><span className="stat-etiqueta">Total del mes</span></div>
        <div className="stat-card"><span className="stat-valor">{formatoMoneda(resumen.pagados)}</span><span className="stat-etiqueta">Pagado</span></div>
        <div className="stat-card alerta"><span className="stat-valor">{formatoMoneda(resumen.pendientes)}</span><span className="stat-etiqueta">Pendiente</span></div>
        <div className="stat-card"><span className="stat-valor">{formatoMoneda(resumen.fijos)}</span><span className="stat-etiqueta">Fijos</span></div>
      </div>}
    </section>

    <section className="tarjeta">
      <h2>Registrar gasto personal</h2>
      <div className="grid-dos-columnas">
        <label>Fecha<input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
        <label>Monto<input type="number" min={1} step={1} inputMode="numeric" value={monto} onChange={e=>setMonto(e.target.value)}/></label>
      </div>
      <div className="formulario">
        <label>Categoría
          <select value={categoriaId} onChange={e=>setCategoriaId(e.target.value)}>
            <option value="">Selecciona</option>
            {categorias.map(c=><option key={c.id} value={c.id}>{c.nombre} · {c.tipo}</option>)}
          </select>
        </label>
        <div className="fila-botones">
          <button type="button" className="boton-secundario" onClick={()=>setMostrarCategoria(v=>!v)}>{mostrarCategoria?'Cancelar':'Nueva categoría'}</button>
        </div>
        {mostrarCategoria&&<div className="tarjeta-interna">
          <div className="grid-dos-columnas">
            <input placeholder="Nombre de categoría" value={nuevaCategoria} onChange={e=>setNuevaCategoria(e.target.value)}/>
            <select value={nuevoTipo} onChange={e=>setNuevoTipo(e.target.value==='fijo'?'fijo':'variable')}><option value="variable">Variable</option><option value="fijo">Fijo</option></select>
          </div>
          <button type="button" className="boton-primario" onClick={()=>void crearCategoria()}>Crear categoría personal</button>
        </div>}
        <div className="selector-estado-pago" role="group" aria-label="Estado del gasto personal">
          <button type="button" className={'boton-estado-pago'+(estado==='pagado'?' activo':'')} onClick={()=>setEstado('pagado')}><strong>Ya pagué</strong><span>Sale de mi dinero disponible.</span></button>
          <button type="button" className={'boton-estado-pago'+(estado==='pendiente'?' activo':'')} onClick={()=>setEstado('pendiente')}><strong>Por pagar</strong><span>Queda pendiente para después.</span></button>
        </div>
        <label>Detalle<textarea rows={3} value={descripcion} onChange={e=>setDescripcion(e.target.value)} placeholder="Ej. mercado, transporte, colegio…"/></label>
        <button type="button" className="boton-primario boton-grande" disabled={guardando} onClick={()=>void guardar()}>{guardando?'Guardando…':'Guardar gasto personal'}</button>
      </div>
    </section>

    <section className="tarjeta">
      <div className="fila-titulo-boton"><h2>Movimientos del mes</h2><span className="detalle-cliente">{gastos.length} gasto(s)</span></div>
      {gastos.length===0?<p className="texto-vacio">No hay gastos personales registrados.</p>:<ul className="lista-resumen">{gastos.map(g=><li key={g.id} className="fila-cartera"><div><strong>{g.categoria}</strong><span>{g.fecha} · {g.tipo} · {g.estado}</span><span>{g.descripcion||'Sin detalle'}</span></div><strong>{formatoMoneda(g.monto)}</strong></li>)}</ul>}
    </section>
    {error&&<p className="texto-error">{error}</p>}
  </div>;
}
