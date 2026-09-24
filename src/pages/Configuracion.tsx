import { useEffect, useState } from 'react';
import { crearHashPin } from '../utils/seguridad';
import { listarModulos } from '../modulos/runtime';
import { database } from '../db/database';
import { aplicarTema } from '../utils/theme';
import { formatoMoneda } from '../utils/format';
import type { ConfiguracionApp, Producto } from '../types';
import { descargarRespaldo, diasDesdeUltimoRespaldo, registrarExportacionRespaldo } from '../utils/respaldo';

type Props = {
  onConfigChanged?: (config: ConfiguracionApp) => void;
};

export default function Configuracion({ onConfigChanged }: Props) {
  const [config, setConfig] = useState<ConfiguracionApp | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [negocio, setNegocio] = useState('');
  const [usuario, setUsuario] = useState('');
  const [color, setColor] = useState('#c2642b');
  const [mensajeRecordatorio, setMensajeRecordatorio] = useState('Hola {nombre}, ¿cómo están? Ya podría ser momento de su próxima compra en COMBOPITT.');
  const [editandoProducto, setEditandoProducto] = useState<Producto | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [pinActual,setPinActual]=useState(''); const [pinConfirmacion,setPinConfirmacion]=useState(''); const [pinMinutos,setPinMinutos]=useState(5);
  const [privacyAceptada,setPrivacyAceptada]=useState(false);
  const [categoriasGasto, setCategoriasGasto] = useState<Awaited<ReturnType<typeof database.listarCategoriasGasto>>>([]);
  const [recurrentes, setRecurrentes] = useState<Awaited<ReturnType<typeof database.listarGastosRecurrentes>>>([]);
  const [nuevoGastoCat, setNuevoGastoCat] = useState({nombre:'',tipo:'variable' as 'fijo'|'variable',naturaleza:'operativo' as 'operativo'|'compra_insumos'|'retiro_dueno',presupuesto:''});
  const [nuevoFijo, setNuevoFijo] = useState({categoria:'',nombre:'',monto:'',dia:'1'});

  async function cargar() {
    try {
      const [cfg, ps, cats, recs] = await Promise.all([
        database.obtenerConfiguracion(),
        database.listarProductos({ incluirInactivos: true }),
        database.listarCategoriasGasto(true),
        database.listarGastosRecurrentes(),
      ]);
      setConfig(cfg);
      setNegocio(cfg.negocio_nombre);
      setUsuario(cfg.usuario_nombre);
      setColor(cfg.color_acento);
      setMensajeRecordatorio(cfg.mensaje_recordatorio ?? 'Hola {nombre}, ¿cómo están? Ya podría ser momento de su próxima compra en COMBOPITT.');
      const seg=await database.obtenerSeguridadPin(); setPinMinutos(seg.lock_minutos);
      setPrivacyAceptada(Boolean(cfg.privacy_accepted_at));
      setProductos(ps);
      setCategoriasGasto(cats);
      setRecurrentes(recs);
      aplicarTema(cfg.color_acento);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function guardarDatos(e: React.FormEvent) {
    e.preventDefault();
    setGuardandoDatos(true);
    try {
      await database.guardarConfiguracion({
        negocio_nombre: negocio.trim(),
        usuario_nombre: usuario.trim(),
        color_acento: color,
        mensaje_recordatorio: mensajeRecordatorio.trim(),
        privacy_accepted_at: privacyAceptada ? (config?.privacy_accepted_at ?? new Date().toISOString()) : undefined,
        privacy_responsable: negocio.trim(),
      });
      const cfg = await database.obtenerConfiguracion();
      setConfig(cfg);
      aplicarTema(cfg.color_acento);
      onConfigChanged?.(cfg);
      setMensaje('Configuración guardada.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoDatos(false);
    }
  }

  async function guardarProducto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardandoProducto(true);
    const datos = new FormData(e.currentTarget);
    const nombre = String(datos.get('nombre') ?? '').trim();
    const precio = Number(datos.get('precio'));
    const costo = Number(datos.get('costo'));
    try {
      if (!nombre) throw new Error('El nombre del producto es obligatorio.');
      if (editandoProducto) {
        await database.actualizarProducto(editandoProducto.id, { nombre, precio, costo });
      } else {
        await database.crearProducto({ nombre, precio, costo });
      }
      setEditandoProducto(null);
      setMostrarNuevo(false);
      await cargar();
      setMensaje('Producto guardado.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardandoProducto(false);
    }
  }

  async function exportarRespaldo() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldo();
      descargarRespaldo(json);
      registrarExportacionRespaldo();
      setMensaje('Respaldo exportado correctamente.');
    } catch (e: unknown) {
      setError('No se pudo exportar el respaldo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  async function archivar(id: number) {
    if (!confirm('¿Archivar este producto? Las ventas anteriores conservarán su precio y costo históricos.')) return;
    try {
      await database.archivarProducto(id);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!config) return <div className="pantalla"><p className="texto-vacio">Cargando configuración…</p></div>;

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div>
          <p className="texto-kicker">Ajustes</p>
          <h1>Configuración</h1>
        </div>
      </header>

      <section className="tarjeta">
        <h2>Tu negocio</h2>
        <form className="formulario" onSubmit={guardarDatos}>
          <label>
            Nombre del negocio
            <input value={negocio} onChange={(e) => setNegocio(e.target.value)} required />
          </label>
          <label>
            Nombre de quien lleva la app
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          </label>
          <label>
            Color de acento
            <div className="selector-color">
              <input type="color" value={color} onChange={(e) => {
                setColor(e.target.value);
                aplicarTema(e.target.value);
              }} />
              <span>{color.toUpperCase()}</span>
            </div>
          </label>
          <label>
            Mensaje de recompra
            <textarea
              rows={4}
              value={mensajeRecordatorio}
              onChange={(e) => setMensajeRecordatorio(e.target.value)}
              placeholder="Usa {nombre} y {dias} para personalizar."
            />
          </label>
          <p className="texto-vacio">Puedes usar las variables {'{nombre}'} y {'{dias}'}.</p>
          <p className="texto-vacio">Moneda: COP (peso colombiano).</p>
          <button className="boton-primario" type="submit" disabled={guardandoDatos}>{guardandoDatos ? 'Guardando…' : 'Guardar cambios'}</button>
        </form>
      </section>

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div>
            <h2>Productos</h2>
            <p className="texto-vacio">Precio y costo se guardan como referencia histórica en cada venta.</p>
          </div>
          <button className="boton-secundario" onClick={() => {
            setEditandoProducto(null);
            setMostrarNuevo((v) => !v);
          }}>
            {mostrarNuevo ? 'Cancelar' : '+ Producto'}
          </button>
        </div>

        {(mostrarNuevo || editandoProducto) && (
          <form className="formulario-tarjeta" onSubmit={guardarProducto}>
            <label>
              Nombre
              <input name="nombre" defaultValue={editandoProducto?.nombre ?? ''} required autoFocus />
            </label>
            <div className="grid-dos-columnas">
              <label>
                Precio
                <input name="precio" type="number" min={0} step={1} defaultValue={editandoProducto?.precio ?? 0} required />
              </label>
              <label>
                Costo
                <input name="costo" type="number" min={0} step={1} defaultValue={editandoProducto?.costo ?? 0} required />
              </label>
            </div>
            <div className="fila-botones">
              <button type="button" className="boton-secundario" onClick={() => {
                setEditandoProducto(null);
                setMostrarNuevo(false);
              }}>Cancelar</button>
              <button type="submit" className="boton-primario" disabled={guardandoProducto}>{guardandoProducto ? 'Guardando…' : 'Guardar producto'}</button>
            </div>
          </form>
        )}

        <ul className="lista-productos">
          {productos.map((p) => (
            <li key={p.id} className="fila-producto">
              <div>
                <strong>{p.nombre}</strong>
                <div className="detalle-cliente">{formatoMoneda(p.precio)} venta · {formatoMoneda(p.costo)} costo</div>
              </div>
              <div className="fila-acciones">
                {p.activo === 1 ? (
                  <>
                    <button className="boton-texto" onClick={() => {
                      setEditandoProducto(p);
                      setMostrarNuevo(false);
                    }}>Editar</button>
                    <button className="boton-texto peligro-texto" onClick={() => void archivar(p.id)}>Archivar</button>
                  </>
                ) : (
                  <span className="etiqueta-estado">Archivado</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>


      <section className="tarjeta">
        <div className="fila-titulo-boton"><div><h2>Categorías de gasto</h2><p className="texto-vacio">Fijo/variable y naturaleza determinan cómo entra al Resultado.</p></div></div>
        <div className="formulario">
          <input placeholder="Nombre" value={nuevoGastoCat.nombre} onChange={e=>setNuevoGastoCat({...nuevoGastoCat,nombre:e.target.value})}/>
          <div className="grid-dos-columnas">
            <select value={nuevoGastoCat.tipo} onChange={e=>setNuevoGastoCat({...nuevoGastoCat,tipo:e.target.value as 'fijo'|'variable'})}><option value="fijo">Fijo</option><option value="variable">Variable</option></select>
            <select value={nuevoGastoCat.naturaleza} onChange={e=>setNuevoGastoCat({...nuevoGastoCat,naturaleza:e.target.value as 'operativo'|'compra_insumos'|'retiro_dueno'})}><option value="operativo">Operativo</option><option value="compra_insumos">Compra de insumos</option><option value="retiro_dueno">Retiro del dueño</option></select>
          </div>
          <input type="number" min={0} step={1} placeholder="Presupuesto mensual" value={nuevoGastoCat.presupuesto} onChange={e=>setNuevoGastoCat({...nuevoGastoCat,presupuesto:e.target.value})}/>
          <button className="boton-primario" onClick={async()=>{await database.crearCategoriaGasto({nombre:nuevoGastoCat.nombre,tipo:nuevoGastoCat.tipo,naturaleza:nuevoGastoCat.naturaleza,presupuesto_mensual:nuevoGastoCat.presupuesto?Number(nuevoGastoCat.presupuesto):null});setNuevoGastoCat({...nuevoGastoCat,nombre:'',presupuesto:''});await cargar();}}>Crear categoría</button>
        </div>
        <ul className="lista-resumen">{categoriasGasto.map((c, index)=><li key={c.id}>
          <span>{c.nombre} · {c.tipo} · {c.naturaleza}{c.presupuesto_mensual!=null ? ' · presupuesto '+formatoMoneda(Number(c.presupuesto_mensual)) : ''}</span>
          <span className="fila-botones">
            <button className="boton-texto" type="button" onClick={()=>{const nombre=window.prompt('Nombre de la categoría',c.nombre);if(nombre&&nombre.trim()!==c.nombre)void database.actualizarCategoriaGasto(c.id,{nombre:nombre.trim()}).then(cargar);}}>Editar</button>
            <button className="boton-texto" type="button" disabled={index===0} aria-label="Subir categoría" onClick={()=>void database.reordenarCategoriaGasto(c.id,'arriba').then(cargar)}>↑</button>
            <button className="boton-texto" type="button" disabled={index===categoriasGasto.length-1} aria-label="Bajar categoría" onClick={()=>void database.reordenarCategoriaGasto(c.id,'abajo').then(cargar)}>↓</button>
            <button className="boton-texto peligro-texto" disabled={!c.activa} onClick={()=>void database.archivarCategoriaGasto(c.id).then(cargar)}>Archivar</button>
          </span>
        </li>)}</ul>
      </section>
      <section className="tarjeta">
        <h2>Gastos fijos / recurrentes</h2>
        <div className="grid-dos-columnas">
          <select value={nuevoFijo.categoria} onChange={e=>setNuevoFijo({...nuevoFijo,categoria:e.target.value})}><option value="">Categoría</option>{categoriasGasto.filter(c=>c.activa).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          <input placeholder="Nombre" value={nuevoFijo.nombre} onChange={e=>setNuevoFijo({...nuevoFijo,nombre:e.target.value})}/>
          <input type="number" min={1} step={1} placeholder="Monto estimado" value={nuevoFijo.monto} onChange={e=>setNuevoFijo({...nuevoFijo,monto:e.target.value})}/>
          <input type="number" min={1} max={31} value={nuevoFijo.dia} onChange={e=>setNuevoFijo({...nuevoFijo,dia:e.target.value})}/>
        </div>
        <button className="boton-primario" onClick={async()=>{await database.crearGastoRecurrente({categoria_id:Number(nuevoFijo.categoria),nombre:nuevoFijo.nombre,monto_estimado:Number(nuevoFijo.monto),dia_vencimiento:Number(nuevoFijo.dia)});setNuevoFijo({categoria:'',nombre:'',monto:'',dia:'1'});await cargar();}}>Agregar gasto fijo</button>
        <ul className="lista-resumen">{recurrentes.map(r=><li key={r.id}><span>{r.nombre} · {formatoMoneda(r.monto_estimado)} · día {r.dia_vencimiento}</span><button className="boton-texto peligro-texto" disabled={!r.activo} onClick={()=>void database.archivarGastoRecurrente(r.id).then(cargar)}>Archivar</button></li>)}</ul>
      </section>
      <section className="tarjeta">
        <h2>Módulos</h2>
        <p className="texto-vacio">Los módulos son independientes del núcleo. Desactivarlos conserva sus datos hasta que elijas borrarlos.</p>
        {listarModulos().map((modulo) => <ModuloConfig key={modulo.id} modulo={modulo} onMensaje={setMensaje} />)}
      </section>

      <section className="tarjeta">
        <h2>Privacidad y datos personales</h2>
        <p className="texto-vacio">Los datos de clientes permanecen en el dispositivo salvo una exportación, restauración, compartir o conexión explícitamente iniciada. CAMELLO no incorpora analítica ni telemetría.</p>
        <p className="texto-vacio">Responsable del tratamiento: {negocio || 'tu negocio'}. La app ofrece herramientas de consentimiento; no constituye una declaración de cumplimiento legal. Consulta a un abogado sobre las obligaciones aplicables a tu negocio en Colombia.</p>
        <label className="fila-checkbox">
          <input type="checkbox" checked={privacyAceptada} onChange={e=>setPrivacyAceptada(e.target.checked)} />
          Confirmo que he leído el aviso de privacidad y autorizo el tratamiento local de los datos registrados en CAMELLO.
        </label>
      </section>

      <section className="tarjeta">
        <h2>Privacidad y datos</h2>
        <p className="texto-vacio">PIN local PBKDF2; olvidar el PIN requiere restaurar un respaldo.</p>
        <div className="grid-dos-columnas"><label>PIN nuevo<input inputMode="numeric" type="password" maxLength={6} value={pinActual} onChange={e=>setPinActual(e.target.value.replace(/\D/g,''))}/></label><label>Repetir PIN<input inputMode="numeric" type="password" maxLength={6} value={pinConfirmacion} onChange={e=>setPinConfirmacion(e.target.value.replace(/\D/g,''))}/></label></div>
        <label>Bloquear después de (minutos)<input type="number" min={1} max={120} value={pinMinutos} onChange={e=>setPinMinutos(Number(e.target.value))}/></label>
        <div className="fila-botones"><button className="boton-primario" onClick={async()=>{if(pinActual!==pinConfirmacion)throw new Error('Los PIN no coinciden.');const h=await crearHashPin(pinActual);await database.guardarSeguridadPin({habilitado:true,hash:h.hash,salt:h.salt,lock_minutos:pinMinutos});setPinActual('');setPinConfirmacion('');setMensaje('PIN activado.');}}>Activar / cambiar PIN</button><button className="boton-secundario" onClick={async()=>{await database.guardarSeguridadPin({habilitado:false,hash:null,salt:null,lock_minutos:pinMinutos});setMensaje('PIN desactivado.');}}>Desactivar PIN</button></div>
      </section>
      <section className="tarjeta">
        <h2>Respaldo</h2>
        {(() => {
          const dias = diasDesdeUltimoRespaldo();
          return dias == null || dias > 7 ? (
            <p className="texto-alerta">
              {dias == null ? 'Aún no has exportado un respaldo.' : 'Han pasado ' + dias + ' días desde el último respaldo.'}
            </p>
          ) : (
            <p className="texto-vacio">Último respaldo: hace {dias} día(s).</p>
          );
        })()}
        <button className="boton-primario boton-grande" type="button" onClick={() => void exportarRespaldo()} disabled={exportando}>
          {exportando ? 'Exportando…' : 'Exportar respaldo'}
        </button>
      </section>

      {mensaje && <p className="banner-exito">{mensaje}</p>}
      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}

function ModuloConfig({ modulo, onMensaje }: { modulo: ReturnType<typeof listarModulos>[number]; onMensaje: (mensaje: string) => void }) {
  const [habilitado,setHabilitado]=useState<boolean>(true);
  const [cargando,setCargando]=useState(true);
  useEffect(()=>{void database.obtenerModuloHabilitado(modulo.id).then(setHabilitado).finally(()=>setCargando(false));},[modulo.id]);
  return <div className="fila-botones">
    <strong>{modulo.nombre}</strong>
    <button className={habilitado ? 'boton-primario' : 'boton-secundario'} disabled={cargando} onClick={async()=>{const siguiente=!habilitado;await database.guardarModuloHabilitado(modulo.id,siguiente);setHabilitado(siguiente);onMensaje(siguiente?modulo.nombre+' activado.':modulo.nombre+' desactivado.');}}>
      {habilitado ? 'Activado' : 'Desactivado'}
    </button>
    <button className="boton-texto peligro-texto" onClick={async()=>{if(!window.confirm('¿Borrar los datos de '+modulo.nombre+'? Esta acción no borra datos del núcleo.'))return;await database.limpiarModuloDatosPrefijados(modulo.id);onMensaje('Datos del módulo borrados.');}}>
      Borrar datos
    </button>
  </div>;
}
