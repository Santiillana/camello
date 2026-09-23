import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen } from '../types';
import { formatoMoneda } from '../utils/format';

const ETIQUETA_SEGUIMIENTO: Record<string, string> = {
  ACTIVO: 'Activo',
  POR_CONTACTAR: 'Por contactar',
  INACTIVO: 'Inactivo',
};

export default function Clientes() {
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [params] = useSearchParams();
  const [mostrarForm, setMostrarForm] = useState(params.get('nuevo') === '1');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function cargar(texto?: string) {
    try {
      setClientes(await database.listarClientes({ soloActivos: true, texto }));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void cargar(); }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(busqueda || undefined); }, 250);
    return () => window.clearTimeout(t);
  }, [busqueda]);

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Clientes</h1>
        <button className="boton-secundario" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo cliente'}
        </button>
      </header>

      {error && <p className="texto-error">{error}</p>}

      {mostrarForm && (
        <FormNuevoCliente
          onCreado={(id) => {
            setMostrarForm(false);
            void cargar();
            navigate(`/clientes/${id}`);
          }}
        />
      )}

      <input
        className="campo-busqueda"
        placeholder="Buscar por nombre o teléfono…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <ul className="lista-clientes">
        {clientes.map((c) => (
          <li key={c.id}>
            <Link to={`/clientes/${c.id}`} className="tarjeta-cliente">
              <div>
                <strong>{c.nombre}</strong>
                <div className="detalle-cliente">
                  {c.mascotas.length > 0 && <span>{c.mascotas.map((m) => m.nombre).join(', ')} · </span>}
                  {c.ultima_compra ? `Última compra: ${c.ultima_compra}` : 'Sin compras aún'}
                </div>
              </div>
              <div className="lado-derecho-cliente">
                {c.pendiente > 0 && <span className="etiqueta-pendiente">{formatoMoneda(c.pendiente)}</span>}
                <span className={'etiqueta-seguimiento ' + c.seguimiento.toLowerCase()}>
                  {ETIQUETA_SEGUIMIENTO[c.seguimiento]}
                </span>
              </div>
            </Link>
          </li>
        ))}
        {clientes.length === 0 && !error && <p className="texto-vacio">Todavía no hay clientes registrados.</p>}
      </ul>
    </div>
  );
}

function FormNuevoCliente({ onCreado }: { onCreado: (id: number) => void }) {
  const [nombre, setNombre] = useState('');
  const [telefono1, setTelefono1] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const id = await database.crearCliente({
        nombre: nombre.trim(),
        telefono1: telefono1.trim() || undefined,
      });
      onCreado(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <label>
        Nombre completo
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </label>
      <label>
        Teléfono
        <input value={telefono1} onChange={(e) => setTelefono1(e.target.value)} inputMode="tel" />
      </label>
      {error && <p className="texto-error">{error}</p>}
      <button type="submit" className="boton-primario" disabled={guardando || !nombre.trim()}>
        {guardando ? 'Guardando…' : 'Guardar cliente'}
      </button>
    </form>
  );
}
