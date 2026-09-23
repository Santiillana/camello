import { useState } from 'react';
import { database } from '../db/database';
import { DEFAULT_ACCENT, aplicarTema } from '../utils/theme';
import type { ConfiguracionApp } from '../types';

type Props = {
  onCompletada: (config: ConfiguracionApp) => void;
};

export default function ConfiguracionInicial({ onCompletada }: Props) {
  const [negocio, setNegocio] = useState('');
  const [usuario, setUsuario] = useState('');
  const [color, setColor] = useState(DEFAULT_ACCENT);
  const [producto, setProducto] = useState('Galletas carnívoras');
  const [precio, setPrecio] = useState('13000');
  const [costo, setCosto] = useState('7000');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await database.guardarConfiguracionInicial(
        {
          negocio_nombre: negocio.trim(),
          usuario_nombre: usuario.trim(),
          color_acento: color,
        },
        {
          nombre: producto.trim(),
          precio: Number(precio),
          costo: Number(costo),
        },
      );
      const config = await database.obtenerConfiguracion();
      aplicarTema(config.color_acento);
      onCompletada(config);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="pantalla pantalla-inicial">
      <section className="tarjeta-inicial">
        <div className="marca-inicial">CAMELLO</div>
        <p className="texto-kicker">Configuración inicial</p>
        <h1>Vamos a preparar tu espacio de trabajo</h1>
        <p className="texto-vacio">
          Todo queda guardado localmente. No necesitas crear una cuenta.
        </p>

        <form className="formulario" onSubmit={guardar}>
          <label>
            Nombre del negocio
            <input value={negocio} onChange={(e) => setNegocio(e.target.value)} autoFocus required />
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

          <div className="separador-seccion">
            <strong>Producto inicial</strong>
            <span className="texto-vacio">Puedes cambiarlo luego en Configuración.</span>
          </div>

          <label>
            Nombre del producto
            <input value={producto} onChange={(e) => setProducto(e.target.value)} required />
          </label>

          <div className="grid-dos-columnas">
            <label>
              Precio de venta
              <input type="number" min={0} step={1} value={precio} onChange={(e) => setPrecio(e.target.value)} required />
            </label>
            <label>
              Costo unitario
              <input type="number" min={0} step={1} value={costo} onChange={(e) => setCosto(e.target.value)} required />
            </label>
          </div>

          {error && <p className="texto-error">{error}</p>}

          <button type="submit" className="boton-primario boton-grande" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Entrar a CAMELLO'}
          </button>
        </form>
      </section>
    </main>
  );
}
