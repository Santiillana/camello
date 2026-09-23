import { useEffect, useState } from 'react';
import { database } from '../db/database';
import { aplicarTema } from '../utils/theme';
import { formatoMoneda } from '../utils/format';
import type { ConfiguracionApp, Producto } from '../types';

type Props = {
  onConfigChanged?: (config: ConfiguracionApp) => void;
};

export default function Configuracion({ onConfigChanged }: Props) {
  const [config, setConfig] = useState<ConfiguracionApp | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [negocio, setNegocio] = useState('');
  const [usuario, setUsuario] = useState('');
  const [color, setColor] = useState('#c2642b');
  const [editandoProducto, setEditandoProducto] = useState<Producto | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    try {
      const [cfg, ps] = await Promise.all([
        database.obtenerConfiguracion(),
        database.listarProductos({ incluirInactivos: true }),
      ]);
      setConfig(cfg);
      setNegocio(cfg.negocio_nombre);
      setUsuario(cfg.usuario_nombre);
      setColor(cfg.color_acento);
      setProductos(ps);
      aplicarTema(cfg.color_acento);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function guardarDatos(e: React.FormEvent) {
    e.preventDefault();
    try {
      await database.guardarConfiguracion({
        negocio_nombre: negocio.trim(),
        usuario_nombre: usuario.trim(),
        color_acento: color,
      });
      const cfg = await database.obtenerConfiguracion();
      setConfig(cfg);
      aplicarTema(cfg.color_acento);
      onConfigChanged?.(cfg);
      setMensaje('Configuración guardada.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function guardarProducto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
          <p className="texto-vacio">Moneda: COP (peso colombiano).</p>
          <button className="boton-primario" type="submit">Guardar cambios</button>
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
              <button type="submit" className="boton-primario">Guardar producto</button>
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

      {mensaje && <p className="banner-exito">{mensaje}</p>}
      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}
