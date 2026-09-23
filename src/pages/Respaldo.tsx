import { useRef, useState } from 'react';
import { database } from '../db/database';

export default function Respaldo() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function exportar() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldo();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `camello-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMensaje('✓ Respaldo descargado correctamente.');
    } catch (e: unknown) {
      setError('No se pudo generar el respaldo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  async function importar(file: File) {
    setImportando(true);
    setMensaje(null);
    setError(null);
    try {
      const texto = await file.text();
      await database.importarRespaldo(texto);
      setMensaje('✓ Respaldo restaurado correctamente. Reinicia la app para refrescar todas las pantallas.');
    } catch (e: unknown) {
      setError('No se pudo restaurar el respaldo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="pantalla">
      <header className="encabezado"><h1>Respaldo</h1></header>

      <section className="tarjeta">
        <p>
          La información de CAMELLO vive localmente en este teléfono. Genera respaldos con
          frecuencia y guárdalos también en otro lugar.
        </p>
      </section>

      <section className="tarjeta">
        <h2>Exportar respaldo</h2>
        <p>Genera un archivo JSON con clientes, mascotas, ventas, rutas y productos.</p>
        <button className="boton-primario" onClick={exportar} disabled={exportando || importando}>
          {exportando ? 'Generando…' : '⬇️ Descargar respaldo'}
        </button>
      </section>

      <section className="tarjeta">
        <h2>Importar respaldo</h2>
        <p className="texto-alerta">⚠️ La restauración reemplaza los datos actuales.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          disabled={importando || exportando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && confirm('¿Restaurar este respaldo? Se reemplazarán los datos actuales.')) void importar(f);
          }}
        />
        {importando && <p>Restaurando…</p>}
      </section>

      {mensaje && <p className="banner-exito">{mensaje}</p>}
      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}
