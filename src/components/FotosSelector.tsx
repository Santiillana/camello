import { useState } from 'react';
import type { CategoriaFoto } from '../types';

export type FotoBorrador = {
  categoria: CategoriaFoto;
  referencia?: string;
  data_url: string;
  nombre: string;
};

function esCategoriaFoto(valor: string): CategoriaFoto {
  return valor === 'cliente' || valor === 'mascota' || valor === 'producto' || valor === 'otro' ? valor : 'otro';
}

type Props = {
  fotos: FotoBorrador[];
  onChange: (fotos: FotoBorrador[]) => void;
  onOmitir?: () => void;
};

export async function comprimirArchivo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la foto.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.78);
}

export default function FotosSelector({ fotos, onChange, onOmitir }: Props) {
  const [procesando, setProcesando] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaFoto>('cliente');
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function seleccionar(files: FileList | null) {
    if (!files?.length) return;
    setProcesando(true);
    setError(null);
    try {
      const nuevas: FotoBorrador[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        if (!file.type.startsWith('image/')) continue;
        const data_url = await comprimirArchivo(file);
        if (data_url.length > 4_000_000) throw new Error('La foto comprimida supera el límite de almacenamiento por foto.');
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.quota && estimate.usage && estimate.usage / estimate.quota > 0.9) throw new Error('Hay poco espacio disponible. Exporta un respaldo antes de seguir guardando fotos.');
        }
        nuevas.push({
          categoria,
          referencia: referencia.trim() || undefined,
          data_url,
          nombre: file.name,
        });
      }
      onChange([...fotos, ...nuevas]);
      setReferencia('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="fotos-selector">
      <div className="grid-dos-columnas">
        <label>
          ¿Qué muestra la foto?
          <select value={categoria} onChange={(e) => setCategoria(esCategoriaFoto(e.target.value))}>
            <option value="cliente">Cliente</option>
            <option value="mascota">Mascota</option>
            <option value="casa">Casa / ubicación</option>
          </select>
        </label>
        {categoria === 'mascota' && (
          <label>
            Nombre de la mascota
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </label>
        )}
      </div>

      <label className="boton-secundario boton-archivo">
        {procesando ? 'Comprimiendo…' : '📷 Agregar fotos'}
        <input type="file" accept="image/*" multiple capture="environment" onChange={(e) => void seleccionar(e.target.files)} disabled={procesando} />
      </label>

      <div className="fotos-grid">
        {fotos.map((foto, index) => (
          <figure className="foto-preview" key={foto.nombre + index}>
            <img src={foto.data_url} alt={foto.nombre} />
            <figcaption>{foto.categoria}{foto.referencia ? ' · ' + foto.referencia : ''}</figcaption>
            <button type="button" className="boton-texto peligro-texto" onClick={() => onChange(fotos.filter((_, i) => i !== index))}>Quitar</button>
          </figure>
        ))}
      </div>

      {error && <p className="texto-error">{error}</p>}
      {onOmitir && <button type="button" className="boton-texto" onClick={onOmitir}>Omitir fotos</button>}
    </div>
  );
}
