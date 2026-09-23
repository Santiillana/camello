import { useRef, useState } from 'react';
import { database } from '../db/database';

export default function Respaldo() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function exportar() {
    setExportando(true);
    setMensaje(null);
    try {
      const json = await database.exportarRespaldo();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `camello-respaldo-${fecha}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMensaje('✓ Respaldo descargado correctamente.');
    } catch (e) {
      setMensaje('No se pudo generar el respaldo: ' + String((e as Error).message ?? e));
    } finally {
      setExportando(false);
    }
  }

  async function importar(file: File) {
    setImportando(true);
    setMensaje(null);
    try {
      const texto = await file.text();
      await database.importarRespaldo(texto);
      setMensaje('✓ Respaldo restaurado. Vuelve a Inicio para ver los datos.');
    } catch (e) {
      setMensaje('No se pudo restaurar el respaldo: ' + String((e as Error).message ?? e));
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="pantalla">
      <header className="encabezado">
        <h1>Respaldo</h1>
      </header>

      <section className="tarjeta">
        <p>
          Toda la información de CAMELLO vive únicamente en este teléfono. Si el teléfono se
          pierde o se daña, y no tienes un respaldo guardado en otro lugar, esa información se
          pierde también. Genera un respaldo con frecuencia y guárdalo fuera del teléfono
          (Google Drive, correo, computador).
        </p>
      </section>

      <section className="tarjeta">
        <h2>Exportar respaldo</h2>
        <p>Genera un archivo .json con todos tus clientes, mascotas, ventas y rutas.</p>
        <button className="boton-primario" onClick={exportar} disabled={exportando}>
          {exportando ? 'Generando…' : '⬇️ Descargar respaldo'}
        </button>
      </section>

      <section className="tarjeta">
        <h2>Importar respaldo</h2>
        <p className="texto-alerta">⚠️ Esto reemplaza los datos actuales por los del archivo elegido.</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && confirm('¿Restaurar este respaldo? Se reemplazarán los datos actuales.')) importar(f);
          }}
        />
        {importando && <p>Restaurando…</p>}
      </section>

      {mensaje && <p className="banner-exito">{mensaje}</p>}
    </div>
  );
}
