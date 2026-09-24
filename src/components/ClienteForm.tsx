import { useMemo, useState } from 'react';
import BorradorPendiente from './BorradorPendiente';
import { useBorrador } from '../hooks/useBorrador';
import type { Mascota } from '../types';
import AsistenteTarjetas from './AsistenteTarjetas';
import FotosSelector, { type FotoBorrador } from './FotosSelector';
import UbicacionSelector from './UbicacionSelector';

type MascotaBorrador = {
  nombre: string;
  cumple_dia: string;
  cumple_mes: string;
  sexo: 'M' | 'H' | 'Desconocido';
  raza: string;
  tamano: 'Pequeño' | 'Mediano' | 'Grande';
  preferencias: string;
  observaciones: string;
};

type Props = {
  onGuardado: (clienteId: number) => void;
  onCancelar?: () => void;
  textoBoton?: string;
  borradorClave?: string;
};

const mascotaVacia = (): MascotaBorrador => ({
  nombre: '',
  cumple_dia: '',
  cumple_mes: '',
  sexo: 'Desconocido',
  raza: '',
  tamano: 'Mediano',
  preferencias: '',
  observaciones: '',
});

export default function ClienteForm({ onGuardado, onCancelar, textoBoton = 'Guardar cliente', borradorClave = 'nuevo' }: Props) {
  const [nombre, setNombre] = useState('');
  const [telefono1, setTelefono1] = useState('');
  const [telefono2, setTelefono2] = useState('');
  const [cumpleDia, setCumpleDia] = useState('');
  const [cumpleMes, setCumpleMes] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [mascotas, setMascotas] = useState<MascotaBorrador[]>([]);
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [precision, setPrecision] = useState<number | undefined>();
  const [fuente, setFuente] = useState<'gps' | 'whatsapp' | 'manual' | undefined>();
  const [fechaUbicacion, setFechaUbicacion] = useState<string | undefined>();
  const [fotos, setFotos] = useState<FotoBorrador[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasoInicial, setPasoInicial] = useState(0);

  type DatosBorradorCliente = {
    nombre: string;
    telefono1: string;
    telefono2: string;
    cumpleDia: string;
    cumpleMes: string;
    observaciones: string;
    mascotas: MascotaBorrador[];
    lat?: number;
    lng?: number;
    precision?: number;
    fuente?: 'gps' | 'whatsapp' | 'manual';
    fechaUbicacion?: string;
    fotos: FotoBorrador[];
  };

  const datosBorrador: DatosBorradorCliente = {
    nombre, telefono1, telefono2, cumpleDia, cumpleMes, observaciones,
    mascotas, lat, lng, precision, fuente, fechaUbicacion, fotos,
  };
  const borrador = useBorrador<DatosBorradorCliente>({
    tipo: 'cliente-nuevo',
    clave: borradorClave,
    datos: datosBorrador,
    paso: pasoInicial,
  });

  function actualizarMascota(index: number, cambios: Partial<MascotaBorrador>) {
    setMascotas((actuales) => actuales.map((m, i) => i === index ? { ...m, ...cambios } : m));
  }

  const tarjetas = useMemo(() => [
    {
      id: 'nombre',
      titulo: 'Nombre completo',
      contenido: (
        <label>
          Nombre completo
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
      ),
      validar: () => nombre.trim() ? null : 'Escribe el nombre completo.',
    },
    {
      id: 'telefono1',
      titulo: 'Teléfono 1',
      contenido: (
        <label>
          Teléfono 1
          <input value={telefono1} onChange={(e) => setTelefono1(e.target.value)} inputMode="tel" />
        </label>
      ),
      validar: () => telefono1.trim() ? null : 'Escribe al menos un teléfono.',
    },
    {
      id: 'telefono2',
      titulo: 'Teléfono 2',
      opcional: true,
      contenido: (
        <label>
          Teléfono 2
          <input value={telefono2} onChange={(e) => setTelefono2(e.target.value)} inputMode="tel" />
        </label>
      ),
    },
    {
      id: 'cumpleanos',
      titulo: 'Cumpleaños',
      opcional: true,
      contenido: (
        <div className="grid-dos-columnas">
          <label>
            Día
            <input type="number" min={1} max={31} value={cumpleDia} onChange={(e) => setCumpleDia(e.target.value)} />
          </label>
          <label>
            Mes
            <input type="number" min={1} max={12} value={cumpleMes} onChange={(e) => setCumpleMes(e.target.value)} />
          </label>
        </div>
      ),
      validar: () => {
        const vacio = !cumpleDia && !cumpleMes;
        if (vacio) return null;
        return cumpleDia && cumpleMes ? null : 'Indica día y mes, o deja ambos vacíos.';
      },
    },
    {
      id: 'observaciones',
      titulo: 'Observaciones',
      opcional: true,
      contenido: (
        <label>
          Observaciones
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={5} />
        </label>
      ),
    },
    {
      id: 'mascotas',
      titulo: 'Mascotas',
      opcional: true,
      contenido: (
        <div className="asistente-lista-mascotas">
          {mascotas.map((mascota, index) => (
            <article className="tarjeta-mascota formulario" key={index}>
              <div className="fila-titulo-boton">
                <strong>Mascota {index + 1}</strong>
                <button
                  type="button"
                  className="boton-texto peligro-texto"
                  onClick={() => setMascotas((actuales) => actuales.filter((_, i) => i !== index))}
                >
                  Quitar
                </button>
              </div>
              <label>Nombre<input value={mascota.nombre} onChange={(e) => actualizarMascota(index, { nombre: e.target.value })} /></label>
              <div className="grid-dos-columnas">
                <label>Día<input type="number" min={1} max={31} value={mascota.cumple_dia} onChange={(e) => actualizarMascota(index, { cumple_dia: e.target.value })} /></label>
                <label>Mes<input type="number" min={1} max={12} value={mascota.cumple_mes} onChange={(e) => actualizarMascota(index, { cumple_mes: e.target.value })} /></label>
              </div>
              <div className="grid-dos-columnas">
                <label>
                  Sexo
                  <select value={mascota.sexo} onChange={(e) => actualizarMascota(index, { sexo: e.target.value as MascotaBorrador['sexo'] })}>
                    <option value="Desconocido">No especificado</option>
                    <option value="M">Macho</option>
                    <option value="H">Hembra</option>
                  </select>
                </label>
                <label>
                  Tamaño
                  <select value={mascota.tamano} onChange={(e) => actualizarMascota(index, { tamano: e.target.value as MascotaBorrador['tamano'] })}>
                    <option>Pequeño</option>
                    <option>Mediano</option>
                    <option>Grande</option>
                  </select>
                </label>
              </div>
              <label>Raza<input value={mascota.raza} onChange={(e) => actualizarMascota(index, { raza: e.target.value })} /></label>
              <label>Preferencias<input value={mascota.preferencias} onChange={(e) => actualizarMascota(index, { preferencias: e.target.value })} /></label>
              <label>Observaciones<textarea rows={2} value={mascota.observaciones} onChange={(e) => actualizarMascota(index, { observaciones: e.target.value })} /></label>
            </article>
          ))}
          <button type="button" className="boton-secundario" onClick={() => setMascotas((actuales) => [...actuales, mascotaVacia()])}>
            + Agregar otra mascota
          </button>
        </div>
      ),
      validar: () => {
        if (mascotas.some((m) => !m.nombre.trim())) return 'Completa el nombre de cada mascota o quítala.';
        return null;
      },
    },
    {
      id: 'ubicacion',
      titulo: 'Ubicación',
      opcional: true,
      contenido: (
        <UbicacionSelector
          lat={lat}
          lng={lng}
          precision_m={precision}
          fuente={fuente}
          onChange={(value) => {
            setLat(value.lat);
            setLng(value.lng);
            setPrecision(value.precision_m);
            setFuente(value.fuente);
            setFechaUbicacion(value.fecha);
          }}
          onOmitir={() => {
            setLat(undefined);
            setLng(undefined);
            setPrecision(undefined);
            setFuente(undefined);
            setFechaUbicacion(undefined);
          }}
        />
      ),
    },
    {
      id: 'fotos',
      titulo: 'Fotos',
      opcional: true,
      contenido: (
        <FotosSelector fotos={fotos} onChange={setFotos} onOmitir={() => setFotos([])} />
      ),
    },
  ], [nombre, telefono1, telefono2, cumpleDia, cumpleMes, observaciones, mascotas, lat, lng, precision, fuente, fechaUbicacion, fotos]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const id = await database.crearClienteConMascotas(
        {
          nombre: nombre.trim(),
          telefono1: telefono1.trim() || undefined,
          telefono2: telefono2.trim() || undefined,
          cumple_dia: cumpleDia ? Number(cumpleDia) : undefined,
          cumple_mes: cumpleMes ? Number(cumpleMes) : undefined,
          observaciones: observaciones.trim() || undefined,
          lat,
          lng,
          ubicacion_precision_m: precision,
          ubicacion_fuente: fuente,
          ubicacion_fecha: lat != null && lng != null ? (fechaUbicacion ?? new Date().toISOString()) : undefined,
        },
        mascotas.map((m): Omit<Mascota, 'id' | 'estado'> => ({
          cliente_id: 0,
          nombre: m.nombre.trim(),
          cumple_dia: m.cumple_dia ? Number(m.cumple_dia) : undefined,
          cumple_mes: m.cumple_mes ? Number(m.cumple_mes) : undefined,
          sexo: m.sexo,
          raza: m.raza.trim() || undefined,
          tamano: m.tamano,
          preferencias: m.preferencias.trim() || undefined,
          observaciones: m.observaciones.trim() || undefined,
        })),
      );

      if (fotos.length) {
        await database.guardarFotosCliente(
          id,
          fotos.map((foto) => ({
            categoria: foto.categoria,
            referencia: foto.referencia,
            data_url: foto.data_url,
          })),
        );
      }
      await borrador.limpiar();
      onGuardado(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (error) {
    return (
      <div className="formulario-tarjeta">
        <p className="texto-error">{error}</p>
        <button type="button" className="boton-secundario" onClick={() => setError(null)}>Volver al asistente</button>
      </div>
    );
  }

  return (
    <div className="formulario-tarjeta">
      {borrador.pendiente && (
        <BorradorPendiente
          fecha={borrador.pendiente.updated_at}
          onDescartar={() => void borrador.descartar()}
          onContinuar={async () => {
            const pendiente = borrador.pendiente;
            if (!pendiente) return;
            const paso = await borrador.continuar();
            const datos = pendiente.datos;
            setNombre(datos.nombre);
            setTelefono1(datos.telefono1);
            setTelefono2(datos.telefono2);
            setCumpleDia(datos.cumpleDia);
            setCumpleMes(datos.cumpleMes);
            setObservaciones(datos.observaciones);
            setMascotas(datos.mascotas);
            setLat(datos.lat);
            setLng(datos.lng);
            setPrecision(datos.precision);
            setFuente(datos.fuente);
            setFechaUbicacion(datos.fechaUbicacion);
            setFotos(datos.fotos);
            setPasoInicial(paso);
          }}
        />
      )}
      <AsistenteTarjetas
        titulo="Nuevo cliente"
        tarjetas={tarjetas}
        onCompletar={async () => {
          await guardar();
        }}
        onCancelar={() => onCancelar?.()}
        textoFinal={textoBoton}
        pasoInicial={pasoInicial}
        onPasoChange={setPasoInicial}
        onGuardarBorrador={borrador.guardarAhora}
        onDescartarBorrador={borrador.descartar}
      />
      {guardando && <p className="texto-vacio">Guardando cliente…</p>}
    </div>
  );
}
