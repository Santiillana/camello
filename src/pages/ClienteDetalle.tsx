import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { database } from '../db/database';
import type { ClienteConResumen, Venta } from '../types';
import { formatoMoneda, formatoFecha } from '../utils/format';

export default function ClienteDetalle() {
  const { id } = useParams();
  const clienteId = Number(id);
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<ClienteConResumen | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [mostrarMascota, setMostrarMascota] = useState(false);
  const [mostrarUbicacion, setMostrarUbicacion] = useState(false);

  async function cargar() {
    const [c, v] = await Promise.all([database.obtenerCliente(clienteId), database.listarVentasPorCliente(clienteId)]);
    setCliente(c);
    setVentas(v);
  }

  useEffect(() => {
    cargar();
  }, [clienteId]);

  if (!cliente) return <div className="pantalla">Cargando…</div>;

  return (
    <div className="pantalla">
      <button className="enlace-volver" onClick={() => navigate(-1)}>← Volver</button>

      <header className="encabezado">
        <h1>{cliente.nombre}</h1>
        <span className={'etiqueta-seguimiento ' + cliente.seguimiento.toLowerCase()}>
          {cliente.seguimiento === 'ACTIVO' ? 'Activo' : cliente.seguimiento === 'POR_CONTACTAR' ? 'Por contactar' : 'Inactivo'}
        </span>
      </header>

      <section className="tarjeta">
        {cliente.telefono1 && (
          <p>
            📞 <a href={`https://wa.me/57${cliente.telefono1.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
              {cliente.telefono1} (WhatsApp)
            </a>
          </p>
        )}
        <p>🧾 Total comprado: {formatoMoneda(cliente.total_comprado)}</p>
        {cliente.pendiente > 0 && <p className="texto-alerta">⚠️ Pendiente por cobrar: {formatoMoneda(cliente.pendiente)}</p>}
        {cliente.lat && cliente.lng ? (
          <p>📍 Ubicación guardada ({cliente.lat.toFixed(5)}, {cliente.lng.toFixed(5)})</p>
        ) : (
          <button className="boton-secundario" onClick={() => setMostrarUbicacion(true)}>📍 Guardar ubicación</button>
        )}
      </section>

      {mostrarUbicacion && (
        <FormUbicacion
          onGuardado={() => {
            setMostrarUbicacion(false);
            cargar();
          }}
          onCancelar={() => setMostrarUbicacion(false)}
          clienteId={clienteId}
        />
      )}

      <section>
        <div className="fila-titulo-boton">
          <h2>Mascotas</h2>
          <button className="boton-texto" onClick={() => setMostrarMascota((v) => !v)}>
            {mostrarMascota ? 'Cancelar' : '+ Agregar'}
          </button>
        </div>
        {mostrarMascota && (
          <FormMascota
            clienteId={clienteId}
            onCreada={() => {
              setMostrarMascota(false);
              cargar();
            }}
          />
        )}
        {cliente.mascotas.length === 0 && <p className="texto-vacio">Sin mascotas registradas.</p>}
        {cliente.mascotas.map((m) => (
          <div key={m.id} className="tarjeta-mascota">
            <strong>{m.nombre}</strong> {m.raza && `· ${m.raza}`} {m.tamano && `· ${m.tamano}`}
          </div>
        ))}
      </section>

      <section>
        <div className="fila-titulo-boton">
          <h2>Historial de compras</h2>
          <Link to="/venta-nueva" state={{ clienteId }} className="boton-texto">+ Nueva venta</Link>
        </div>
        {ventas.length === 0 && <p className="texto-vacio">Sin compras registradas todavía.</p>}
        <ul className="lista-ventas">
          {ventas.map((v) => (
            <li key={v.id} className="fila-venta">
              <div>
                <strong>{v.producto_nombre}</strong> × {v.cantidad}
                <div className="detalle-cliente">{formatoFecha(v.fecha)} {v.hora}</div>
              </div>
              <div className="lado-derecho-cliente">
                <span>{formatoMoneda(v.total)}</span>
                {v.estado_pago === 'PENDIENTE' ? (
                  <button className="boton-chip" onClick={async () => { await database.marcarVentaPagada(v.id); cargar(); }}>
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
          if (confirm('¿Archivar este cliente? No se borra su historial.')) {
            await database.archivarCliente(clienteId);
            navigate('/clientes');
          }
        }}
      >
        Archivar cliente
      </button>
    </div>
  );
}

function FormMascota({ clienteId, onCreada }: { clienteId: number; onCreada: () => void }) {
  const [nombre, setNombre] = useState('');
  const [raza, setRaza] = useState('');
  const [tamano, setTamano] = useState<'Pequeño' | 'Mediano' | 'Grande'>('Mediano');

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    await database.crearMascota({ cliente_id: clienteId, nombre: nombre.trim(), raza: raza.trim() || undefined, tamano });
    onCreada();
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <label>
        Nombre de la mascota
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </label>
      <label>
        Raza
        <input value={raza} onChange={(e) => setRaza(e.target.value)} />
      </label>
      <label>
        Tamaño
        <select value={tamano} onChange={(e) => setTamano(e.target.value as typeof tamano)}>
          <option>Pequeño</option>
          <option>Mediano</option>
          <option>Grande</option>
        </select>
      </label>
      <button type="submit" className="boton-primario">Guardar mascota</button>
    </form>
  );
}

function FormUbicacion({ clienteId, onGuardado, onCancelar }: { clienteId: number; onGuardado: () => void; onCancelar: () => void }) {
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
    await database.actualizarCliente(clienteId, { lat: parseFloat(lat), lng: parseFloat(lng) });
    onGuardado();
  }

  return (
    <div className="formulario-tarjeta">
      <button type="button" className="boton-primario" onClick={fijarConGps} disabled={obteniendo}>
        📡 {obteniendo ? 'Obteniendo…' : 'Fijar mi ubicación actual'}
      </button>
      {errorGps && <p className="texto-error">{errorGps}</p>}
      <p className="texto-separador">— o introduce las coordenadas —</p>
      <label>
        Latitud
        <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="4.1420" />
      </label>
      <label>
        Longitud
        <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="-73.6266" />
      </label>
      <div className="fila-botones">
        <button className="boton-secundario" onClick={onCancelar} type="button">Cancelar</button>
        <button className="boton-primario" onClick={guardar} type="button" disabled={!lat || !lng}>Guardar</button>
      </div>
    </div>
  );
}
