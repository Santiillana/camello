import { useState } from 'react';
import { database } from '../db/database';
import type { Mascota, SexoMascota, TamanoMascota } from '../types';

type MascotaBorrador = {
  nombre: string;
  cumple_dia: string;
  cumple_mes: string;
  sexo: SexoMascota;
  raza: string;
  tamano: TamanoMascota;
  preferencias: string;
  observaciones: string;
};

type Props = {
  onGuardado: (clienteId: number) => void;
  onCancelar?: () => void;
  textoBoton?: string;
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

export default function ClienteForm({ onGuardado, onCancelar, textoBoton = 'Guardar cliente' }: Props) {
  const [nombre, setNombre] = useState('');
  const [telefono1, setTelefono1] = useState('');
  const [telefono2, setTelefono2] = useState('');
  const [cumpleDia, setCumpleDia] = useState('');
  const [cumpleMes, setCumpleMes] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [mascotas, setMascotas] = useState<MascotaBorrador[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function agregarMascota() {
    setMascotas((actuales) => [...actuales, mascotaVacia()]);
  }

  function actualizarMascota(index: number, cambios: Partial<MascotaBorrador>) {
    setMascotas((actuales) => actuales.map((m, i) => i === index ? { ...m, ...cambios } : m));
  }

  function quitarMascota(index: number) {
    setMascotas((actuales) => actuales.filter((_, i) => i !== index));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
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
      onGuardado(id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario-tarjeta" onSubmit={guardar}>
      <div className="separador-seccion">
        <strong>Datos del cliente</strong>
        <span className="texto-vacio">Los campos esenciales son nombre y, cuando sea posible, teléfono.</span>
      </div>

      <label>
        Nombre completo
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </label>

      <div className="grid-dos-columnas">
        <label>
          Teléfono 1
          <input value={telefono1} onChange={(e) => setTelefono1(e.target.value)} inputMode="tel" />
        </label>
        <label>
          Teléfono 2
          <input value={telefono2} onChange={(e) => setTelefono2(e.target.value)} inputMode="tel" />
        </label>
      </div>

      <div className="grid-dos-columnas">
        <label>
          Día de cumpleaños
          <input type="number" min={1} max={31} value={cumpleDia} onChange={(e) => setCumpleDia(e.target.value)} />
        </label>
        <label>
          Mes de cumpleaños
          <input type="number" min={1} max={12} value={cumpleMes} onChange={(e) => setCumpleMes(e.target.value)} />
        </label>
      </div>

      <label>
        Observaciones
        <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} />
      </label>

      <div className="separador-seccion fila-titulo-boton">
        <div>
          <strong>Mascotas</strong>
          <span className="texto-vacio">Puedes agregar una o varias ahora y seguir después.</span>
        </div>
        <button type="button" className="boton-secundario" onClick={agregarMascota}>+ Mascota</button>
      </div>

      {mascotas.map((mascota, index) => (
        <div className="tarjeta-mascota formulario" key={index}>
          <div className="fila-titulo-boton">
            <strong>Mascota {index + 1}</strong>
            <button type="button" className="boton-texto peligro-texto" onClick={() => quitarMascota(index)}>Quitar</button>
          </div>

          <label>
            Nombre
            <input value={mascota.nombre} onChange={(e) => actualizarMascota(index, { nombre: e.target.value })} required />
          </label>

          <div className="grid-dos-columnas">
            <label>
              Día
              <input type="number" min={1} max={31} value={mascota.cumple_dia} onChange={(e) => actualizarMascota(index, { cumple_dia: e.target.value })} />
            </label>
            <label>
              Mes
              <input type="number" min={1} max={12} value={mascota.cumple_mes} onChange={(e) => actualizarMascota(index, { cumple_mes: e.target.value })} />
            </label>
          </div>

          <div className="grid-dos-columnas">
            <label>
              Sexo
              <select value={mascota.sexo} onChange={(e) => actualizarMascota(index, { sexo: e.target.value as SexoMascota })}>
                <option value="Desconocido">No especificado</option>
                <option value="M">Macho</option>
                <option value="H">Hembra</option>
              </select>
            </label>
            <label>
              Tamaño
              <select value={mascota.tamano} onChange={(e) => actualizarMascota(index, { tamano: e.target.value as TamanoMascota })}>
                <option>Pequeño</option>
                <option>Mediano</option>
                <option>Grande</option>
              </select>
            </label>
          </div>

          <label>
            Raza
            <input value={mascota.raza} onChange={(e) => actualizarMascota(index, { raza: e.target.value })} />
          </label>

          <label>
            Preferencias
            <input value={mascota.preferencias} onChange={(e) => actualizarMascota(index, { preferencias: e.target.value })} placeholder="Sabor, hábitos, observaciones útiles…" />
          </label>

          <label>
            Observaciones
            <textarea value={mascota.observaciones} onChange={(e) => actualizarMascota(index, { observaciones: e.target.value })} rows={2} />
          </label>
        </div>
      ))}

      {error && <p className="texto-error">{error}</p>}

      <div className="fila-botones">
        {onCancelar && <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>}
        <button type="submit" className="boton-primario" disabled={guardando || !nombre.trim()}>
          {guardando ? 'Guardando…' : textoBoton}
        </button>
      </div>
    </form>
  );
}
