import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { database } from '../db/database';
import type {
  Cliente,
  ClienteConResumen,
  Mascota,
  SexoMascota,
  TamanoMascota,
  Venta,
} from '../types';
import { formatoFecha, formatoMoneda } from '../utils/format';

export default function ClienteDetalle() {
  const { id } = useParams();
  const clienteId = Number(id);
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<ClienteConResumen | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [clientes, setClientes] = useState<ClienteConResumen[]>([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [mostrarMascota, setMostrarMascota] = useState(false);
  const [mostrarUbicacion, setMostrarUbicacion] = useState(false);
  const [mascotaEditando, setMascotaEditando] = useState<Mascota | null>(null);
  const [mascotaTransfiriendo, setMascotaTransfiriendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      const [c, v] = await Promise.all([
        database.obtenerCliente(clienteId),
        database.listarVentasPorCliente(clienteId),
      ]);
      setCliente(c);
      setVentas(v);
      setError(c ? null : 'No se encontró el cliente.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      setError('Cliente inválido.');
      return;
    }
    void cargar();
  }, [clienteId]);

  async function cargarClientesParaTransferir() {
    try {
      setClientes(await database.listarClientes({ soloActivos: true }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function transferirMascota(mascotaId: number, nuevoClienteId: number) {
    try {
      await database.transferirMascota(mascotaId, nuevoClienteId);
      setMascotaTransfiriendo(null);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function archivarMascota(mascotaId: number) {
    if (!confirm('¿Archivar esta mascota? El historial se conservará.')) return;
    try {
      await database.archivarMascota(mascotaId);
      await cargar();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!cliente && !error) return <div className="pantalla">Cargando…</div>;
  if (!cliente) {
    return (
      <div className="pantalla">
        <p className="texto-error">{error}</p>
        <button className="enlace-volver" onClick={() => navigate('/clientes')}>← Volver</button>
      </div>
    );
  }

  const telefonoWhatsApp = cliente.telefono1?.replace(/\D/g, '');
  const cumpleaños = cliente.cumple_dia && cliente.cumple_mes
    ? String(cliente.cumple_dia).padStart(2, '0') + '/' + String(cliente.cumple_mes).padStart(2, '0')
    : 'No registrado';

  return (
    <div className="pantalla">
      <button className="enlace-volver" onClick={() => navigate(-1)}>← Volver</button>

      <header className="encabezado">
        <div>
          <p className="texto-kicker">Cliente</p>
          <h1>{cliente.nombre}</h1>
        </div>
        <span className={'etiqueta-seguimiento ' + cliente.seguimiento.toLowerCase()}>
          {cliente.seguimiento === 'ACTIVO' ? 'Activo' : cliente.seguimiento === 'POR_CONTACTAR' ? 'Por contactar' : 'Inactivo'}
        </span>
      </header>

      {error && <p className="texto-error">{error}</p>}

      {modoEdicion ? (
        <EditarCliente
          cliente={cliente}
          onGuardado={async () => {
            setModoEdicion(false);
            await cargar();
          }}
          onCancelar={() => setModoEdicion(false)}
        />
      ) : (
        <section className="tarjeta">
          <div className="fila-dato"><span>Teléfono 1</span><strong>{cliente.telefono1 || 'No registrado'}</strong></div>
          <div className="fila-dato"><span>Teléfono 2</span><strong>{cliente.telefono2 || 'No registrado'}</strong></div>
          <div className="fila-dato"><span>Cumpleaños</span><strong>{cumpleaños}</strong></div>
          <div className="fila-dato"><span>Registrado</span><strong>{formatoFecha(cliente.fecha_registro)}</strong></div>
          {cliente.observaciones && <div className="fila-dato"><span>Observaciones</span><strong>{cliente.observaciones}</strong></div>}

          <div className="fila-botones">
            {telefonoWhatsApp && (
              <a className="boton-primario" href={'https://wa.me/57' + telefonoWhatsApp} target="_blank" rel="noreferrer">
                💬 WhatsApp
              </a>
            )}
            <button className="boton-secundario" onClick={() => setModoEdicion(true)}>Editar datos</button>
          </div>

          {cliente.lat != null && cliente.lng != null ? (
            <p className="detalle-cliente">📍 Ubicación guardada ({cliente.lat.toFixed(5)}, {cliente.lng.toFixed(5)})</p>
          ) : (
            <button className="boton-texto" onClick={() => setMostrarUbicacion(true)}>📍 Guardar ubicación</button>
          )}
        </section>
      )}

      {mostrarUbicacion && (
        <FormUbicacion
          clienteId={clienteId}
          onGuardado={async () => {
            setMostrarUbicacion(false);
            await cargar();
          }}
          onCancelar={() => setMostrarUbicacion(false)}
        />
      )}

      <section>
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Vinculadas a este cliente</p>
            <h2>Mascotas</h2>
          </div>
          <button
            className="boton-secundario"
            onClick={() => {
              setMascotaEditando(null);
              setMostrarMascota((v) => !v);
            }}
          >
            {mostrarMascota ? 'Cancelar' : '+ Mascota'}
          </button>
        </div>

        {mostrarMascota && (
          <FormMascota
            clienteId={clienteId}
            onGuardada={async () => {
              setMostrarMascota(false);
              await cargar();
            }}
            onCancelar={() => setMostrarMascota(false)}
          />
        )}

        {cliente.mascotas.length === 0 && <p className="texto-vacio">Sin mascotas registradas.</p>}

        <div className="lista-mascotas">
          {cliente.mascotas.map((mascota) => (
            <article className="tarjeta-mascota mascota-completa" key={mascota.id}>
              <div className="fila-titulo-boton">
                <div>
                  <strong>{mascota.nombre}</strong>
                  <span className="detalle-cliente">
                    {mascota.raza || 'Raza no registrada'} · {mascota.tamano || 'Tamaño no registrado'}
                  </span>
                </div>
                <span className="etiqueta-estado">
                  {mascota.sexo === 'M' ? 'Macho' : mascota.sexo === 'H' ? 'Hembra' : 'Sin especificar'}
                </span>
              </div>

              {mascota.cumple_dia && mascota.cumple_mes && (
                <div className="detalle-cliente">
                  Cumpleaños: {String(mascota.cumple_dia).padStart(2, '0')}/{String(mascota.cumple_mes).padStart(2, '0')}
                </div>
              )}
              {mascota.preferencias && <div className="detalle-cliente">Preferencias: {mascota.preferencias}</div>}
              {mascota.observaciones && <div className="detalle-cliente">Notas: {mascota.observaciones}</div>}

              {mascotaEditando?.id === mascota.id ? (
                <FormMascota
                  clienteId={clienteId}
                  inicial={mascota}
                  onGuardada={async () => {
                    setMascotaEditando(null);
                    await cargar();
                  }}
                  onCancelar={() => setMascotaEditando(null)}
                />
              ) : (
                <div className="fila-botones">
                  <button className="boton-texto" onClick={() => setMascotaEditando(mascota)}>Editar</button>
                  <button
                    className="boton-texto"
                    onClick={() => {
                      setMascotaTransfiriendo(mascota.id);
                      void cargarClientesParaTransferir();
                    }}
                  >
                    Cambiar dueño
                  </button>
                  <button className="boton-texto peligro-texto" onClick={() => void archivarMascota(mascota.id)}>Archivar</button>
                </div>
              )}

              {mascotaTransfiriendo === mascota.id && (
                <div className="formulario-tarjeta">
                  <label>
                    Nuevo dueño
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) void transferirMascota(mascota.id, Number(e.target.value));
                      }}
                    >
                      <option value="" disabled>Selecciona un cliente…</option>
                      {clientes.filter((c) => c.id !== clienteId).map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="boton-secundario" onClick={() => setMascotaTransfiriendo(null)}>Cancelar</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="tarjeta">
        <div className="fila-titulo-boton">
          <div>
            <p className="texto-kicker">Resumen</p>
            <h2>Compras y pagos</h2>
          </div>
          <Link to="/venta-nueva" state={{ clienteId }} className="boton-secundario">+ Nueva venta</Link>
        </div>

        <div className="grid-stats">
          <div className="stat-card">
            <span className="stat-valor">{formatoMoneda(cliente.total_comprado)}</span>
            <span className="stat-etiqueta">Total comprado</span>
          </div>
          <div className="stat-card">
            <span className="stat-valor">{formatoMoneda(cliente.pendiente)}</span>
            <span className="stat-etiqueta">Pendiente</span>
          </div>
        </div>
      </section>

      <section>
        <div className="fila-titulo-boton">
          <h2>Historial</h2>
          <span className="detalle-cliente">{ventas.length} venta(s)</span>
        </div>

        {ventas.length === 0 && <p className="texto-vacio">Sin compras registradas todavía.</p>}

        <ul className="lista-ventas">
          {ventas.map((venta) => (
            <li key={venta.id} className="fila-venta">
              <div>
                <strong>{venta.producto_nombre}</strong> × {venta.cantidad}
                <div className="detalle-cliente">{formatoFecha(venta.fecha)} · {venta.hora}</div>
              </div>
              <div className="lado-derecho-cliente">
                <span>{formatoMoneda(venta.total)}</span>
                {venta.estado_pago === 'PENDIENTE' ? (
                  <button
                    className="boton-chip"
                    onClick={async () => {
                      try {
                        await database.marcarVentaPagada(venta.id);
                        await cargar();
                      } catch (e: unknown) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Marcar pagada
                  </button>
                ) : (
                  <span className="etiqueta-pagada">Pagada</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <button
        className="boton-peligro"
        onClick={async () => {
          if (!confirm('¿Archivar este cliente? No se borra su historial.')) return;
          try {
            await database.archivarCliente(clienteId);
            navigate('/clientes');
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Archivar cliente
      </button>
    </div>
  );
}

function EditarCliente({
  cliente,
  onGuardado,
  onCancelar,
}: {
  cliente: Cliente;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(cliente.nombre);
  const [telefono1, setTelefono1] = useState(cliente.telefono1 ?? '');
  const [telefono2, setTelefono2] = useState(cliente.telefono2 ?? '');
  const [cumpleDia, setCumpleDia] = useState(cliente.cumple_dia ? String(cliente.cumple_dia) : '');
  const [cumpleMes, setCumpleMes] = useState(cliente.cumple_mes ? String(cliente.cumple_mes) : '');
  const [observaciones, setObservaciones] = useState(cliente.observaciones ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await database.actualizarCliente(cliente.id, {
        nombre: nombre.trim(),
        telefono1: telefono1.trim() || undefined,
        telefono2: telefono2.trim() || undefined,
        cumple_dia: cumpleDia ? Number(cumpleDia) : undefined,
        cumple_mes: cumpleMes ? Number(cumpleMes) : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      await onGuardado();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <label>Nombre completo<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
      <div className="grid-dos-columnas">
        <label>Teléfono 1<input value={telefono1} onChange={(e) => setTelefono1(e.target.value)} inputMode="tel" /></label>
        <label>Teléfono 2<input value={telefono2} onChange={(e) => setTelefono2(e.target.value)} inputMode="tel" /></label>
      </div>
      <div className="grid-dos-columnas">
        <label>Día<input type="number" min={1} max={31} value={cumpleDia} onChange={(e) => setCumpleDia(e.target.value)} /></label>
        <label>Mes<input type="number" min={1} max={12} value={cumpleMes} onChange={(e) => setCumpleMes(e.target.value)} /></label>
      </div>
      <label>Observaciones<textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} /></label>
      {error && <p className="texto-error">{error}</p>}
      <div className="fila-botones">
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

function FormMascota({
  clienteId,
  inicial,
  onGuardada,
  onCancelar,
}: {
  clienteId: number;
  inicial?: Mascota;
  onGuardada: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [cumpleDia, setCumpleDia] = useState(inicial?.cumple_dia ? String(inicial.cumple_dia) : '');
  const [cumpleMes, setCumpleMes] = useState(inicial?.cumple_mes ? String(inicial.cumple_mes) : '');
  const [sexo, setSexo] = useState<SexoMascota>(inicial?.sexo ?? 'Desconocido');
  const [raza, setRaza] = useState(inicial?.raza ?? '');
  const [tamano, setTamano] = useState<TamanoMascota>(inicial?.tamano ?? 'Mediano');
  const [preferencias, setPreferencias] = useState(inicial?.preferencias ?? '');
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        nombre: nombre.trim(),
        cumple_dia: cumpleDia ? Number(cumpleDia) : undefined,
        cumple_mes: cumpleMes ? Number(cumpleMes) : undefined,
        sexo,
        raza: raza.trim() || undefined,
        tamano,
        preferencias: preferencias.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      };

      if (inicial) {
        await database.actualizarMascota(inicial.id, datos);
      } else {
        await database.crearMascota({ cliente_id: clienteId, ...datos });
      }
      await onGuardada();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus /></label>
      <div className="grid-dos-columnas">
        <label>Día<input type="number" min={1} max={31} value={cumpleDia} onChange={(e) => setCumpleDia(e.target.value)} /></label>
        <label>Mes<input type="number" min={1} max={12} value={cumpleMes} onChange={(e) => setCumpleMes(e.target.value)} /></label>
      </div>
      <div className="grid-dos-columnas">
        <label>Sexo<select value={sexo} onChange={(e) => setSexo(e.target.value as SexoMascota)}><option value="Desconocido">No especificado</option><option value="M">Macho</option><option value="H">Hembra</option></select></label>
        <label>Tamaño<select value={tamano} onChange={(e) => setTamano(e.target.value as TamanoMascota)}><option>Pequeño</option><option>Mediano</option><option>Grande</option></select></label>
      </div>
      <label>Raza<input value={raza} onChange={(e) => setRaza(e.target.value)} /></label>
      <label>Preferencias<input value={preferencias} onChange={(e) => setPreferencias(e.target.value)} /></label>
      <label>Observaciones<textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} /></label>
      {error && <p className="texto-error">{error}</p>}
      <div className="fila-botones">
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="boton-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial ? 'Guardar mascota' : 'Agregar mascota'}
        </button>
      </div>
    </form>
  );
}

function FormUbicacion({
  clienteId,
  onGuardado,
  onCancelar,
}: {
  clienteId: number;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [obteniendo, setObteniendo] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);

  function fijarConGps() {
    setObteniendo(true);
    setErrorGps(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
        setObteniendo(false);
      },
      (err) => {
        setErrorGps(err.message || 'No se pudo obtener la ubicación.');
        setObteniendo(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function guardar() {
    if (!lat || !lng) return;
    try {
      await database.actualizarCliente(clienteId, { lat: Number(lat), lng: Number(lng) });
      await onGuardado();
    } catch (e: unknown) {
      setErrorGps(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="formulario-tarjeta">
      <button type="button" className="boton-primario" onClick={fijarConGps} disabled={obteniendo}>
        📡 {obteniendo ? 'Obteniendo…' : 'Fijar mi ubicación actual'}
      </button>
      {errorGps && <p className="texto-error">{errorGps}</p>}
      <p className="texto-separador">— o introduce las coordenadas —</p>
      <div className="grid-dos-columnas">
        <label>Latitud<input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" /></label>
        <label>Longitud<input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div className="fila-botones">
        <button className="boton-secundario" onClick={onCancelar} type="button">Cancelar</button>
        <button className="boton-primario" onClick={() => void guardar()} type="button" disabled={!lat || !lng}>Guardar</button>
      </div>
    </div>
  );
}
