import { useEffect, useState } from 'react';
import { database } from '../db/database';
import type { Producto } from '../types';
import { formatoMoneda } from '../utils/format';

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try { setError(null); setProductos(await database.listarProductos()); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  useEffect(() => { cargar(); }, []);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <div><h1>Productos</h1><p className="subtitulo">Precio y costo para nuevas ventas.</p></div>
        <button className="boton-secundario" onClick={() => setMostrarNuevo((v) => !v)}>{mostrarNuevo ? 'Cancelar' : '+ Nuevo'}</button>
      </header>
      {error && <p className="banner-error">{error}</p>}
      {mostrarNuevo && <FormProducto onGuardado={() => { setMostrarNuevo(false); cargar(); }} />}
      <section className="lista-productos">
        {productos.map((p) => <ProductoEditor key={p.id} producto={p} onGuardado={cargar} />)}
        {productos.length === 0 && <p className="texto-vacio">No hay productos activos.</p>}
      </section>
    </div>
  );
}

function FormProducto({ onGuardado }: { onGuardado: () => void }) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState(13000);
  const [costo, setCosto] = useState(7000);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    try { setError(null); await database.crearProducto({ nombre, precio, costo }); onGuardado(); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  return <form className="formulario-tarjeta" onSubmit={guardar}>
    <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
    <label>Precio de venta<input type="number" min={0} step={100} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} /></label>
    <label>Costo<input type="number" min={0} step={100} value={costo} onChange={(e) => setCosto(Number(e.target.value))} /></label>
    {error && <p className="texto-error">{error}</p>}
    <button className="boton-primario" type="submit">Guardar producto</button>
  </form>;
}

function ProductoEditor({ producto, onGuardado }: { producto: Producto; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [precio, setPrecio] = useState(producto.precio);
  const [costo, setCosto] = useState(producto.costo);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar() {
    try { await database.actualizarProducto(producto.id, { nombre, precio, costo }); setMensaje('Guardado.'); onGuardado(); }
    catch (e) { setMensaje(String((e as Error)?.message ?? e)); }
  }

  async function archivar() {
    if (!confirm(`¿Archivar "${producto.nombre}"? Las ventas históricas no se borran.`)) return;
    try { await database.archivarProducto(producto.id); onGuardado(); }
    catch (e) { setMensaje(String((e as Error)?.message ?? e)); }
  }

  return <article className="tarjeta">
    <div className="fila-titulo-boton"><h2>{producto.nombre}</h2><button className="boton-peligro" onClick={archivar}>Archivar</button></div>
    <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
    <label>Precio<input type="number" min={0} step={100} value={precio} onChange={(e) => setPrecio(Number(e.target.value))} /></label>
    <label>Costo<input type="number" min={0} step={100} value={costo} onChange={(e) => setCosto(Number(e.target.value))} /></label>
    <p className="detalle-cliente">Utilidad por unidad: {formatoMoneda(precio - costo)}</p>
    {mensaje && <p className="texto-error">{mensaje}</p>}
    <button className="boton-secundario" onClick={guardar}>Guardar cambios</button>
  </article>;
}
