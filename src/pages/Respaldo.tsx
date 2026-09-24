import { useMemo, useRef, useState } from 'react';
import { database } from '../db/database';
import { calcularChecksum, descargarRespaldo, registrarExportacionRespaldo } from '../utils/respaldo';

type MetaRespaldo = {
  exported_at: string;
  schema_version: number;
  checksum: string;
};

const HISTORIAL_KEY = 'camello.respaldos.historial.v1';

function leerHistorial(): MetaRespaldo[] {
  try {
    const raw = localStorage.getItem(HISTORIAL_KEY);
    return raw ? (JSON.parse(raw) as MetaRespaldo[]) : [];
  } catch {
    return [];
  }
}

export default function Respaldo() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [meta, setMeta] = useState<MetaRespaldo | null>(null);
  const [historial, setHistorial] = useState<MetaRespaldo[]>(leerHistorial);
  const inputRef = useRef<HTMLInputElement>(null);
  const respaldoRef = useRef<string | null>(null);

  const ultimo = useMemo(() => meta ?? historial[0] ?? null, [meta, historial]);

  async function exportar() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldo();
      respaldoRef.current = json;
      const parsed = JSON.parse(json) as { exported_at: string; schema_version: number; checksum: string };
      const nuevaMeta = {
        exported_at: parsed.exported_at,
        schema_version: parsed.schema_version,
        checksum: parsed.checksum,
      };
      const nuevas = [nuevaMeta, ...historial].slice(0, 8);
      localStorage.setItem(HISTORIAL_KEY, JSON.stringify(nuevas));
      setHistorial(nuevas);
      setMeta(nuevaMeta);
      descargarRespaldo(json);
      registrarExportacionRespaldo();
      setMensaje('✓ Respaldo generado, verificado y descargado.');
    } catch (e: unknown) {
      setError('No se pudo generar el respaldo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  async function compartir() {
    if (!respaldoRef.current) {
      await exportar();
    }
    const texto = respaldoRef.current;
    if (!texto) return;

    const ver = await database.validarRespaldo(texto);
    const fecha = ver.version + '-' + new Date().toISOString().slice(0, 10);
    const archivo = new File([texto], 'camello-respaldo-' + fecha + '.json', {
      type: 'application/json',
    });

    if (navigator.share && navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({
        title: 'Respaldo CAMELLO',
        text: 'Respaldo verificado · SHA-256 ' + (ver.checksum ?? 'sin checksum'),
        files: [archivo],
      });
      setMensaje('Respaldo compartido desde el dispositivo.');
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: 'Respaldo CAMELLO',
        text: 'Respaldo verificado · SHA-256 ' + (ver.checksum ?? 'sin checksum'),
      });
      setMensaje('El dispositivo no permitió adjuntar el archivo; comparte también el archivo descargado.');
      return;
    }

    setMensaje('Este dispositivo no ofrece compartir directo; usa el archivo descargado.');
  }

  async function importar(file: File) {
    setImportando(true);
    setMensaje(null);
    setError(null);
    try {
      const texto = await file.text();
      const ver = await database.validarRespaldo(texto);
      await database.importarRespaldo(texto);
      respaldoRef.current = texto;
      setMeta({
        exported_at: new Date().toISOString(),
        schema_version: ver.version,
        checksum: ver.checksum ?? await calcularChecksum(JSON.stringify(ver.exportData)),
      });
      setMensaje('✓ Respaldo validado y restaurado. Reinicia la app para refrescar pantallas que ya estaban abiertas.');
    } catch (e: unknown) {
      setError('No se pudo restaurar el respaldo: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function limpiar() {
    const respaldo = respaldoRef.current;
    if (!respaldo) {
      setError('Antes de limpiar debes generar o seleccionar un respaldo verificado.');
      return;
    }
    setLimpiando(true);
    setError(null);
    try {
      await database.validarRespaldo(respaldo);
      const primera = window.confirm('Se borrarán los datos locales después de verificar el respaldo. ¿Continuar?');
      if (!primera) return;
      const palabra = window.prompt('Escribe BORRAR para confirmar la limpieza.');
      if (palabra !== 'BORRAR') {
        setError('Limpieza cancelada: la confirmación exacta es BORRAR.');
        return;
      }
      await database.limpiarAplicacion(respaldo);
      respaldoRef.current = null;
      setMensaje('Aplicación limpia. El respaldo verificado quedó fuera del teléfono en el archivo que descargaste.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLimpiando(false);
    }
  }

  return (
    <div className="pantalla">
      <header className="encabezado"><h1>Respaldo</h1></header>

      <section className="tarjeta">
        <p>
          La información de CAMELLO vive localmente en este teléfono. Los respaldos nuevos
          llevan fecha, versión y checksum SHA-256 para detectar archivos alterados.
        </p>
      </section>

      <section className="tarjeta">
        <h2>Exportar</h2>
        <div className="fila-botones">
          <button className="boton-primario" onClick={() => void exportar()} disabled={exportando || importando || limpiando}>
            {exportando ? 'Generando…' : '⬇️ Descargar respaldo'}
          </button>
          <button className="boton-secundario" onClick={() => void compartir()} disabled={exportando || importando || limpiando}>
            Compartir
          </button>
        </div>
        {ultimo && (
          <div className="lista-resumen">
            <div><span>Versión</span><strong>{ultimo.schema_version}</strong></div>
            <div><span>Fecha</span><strong>{ultimo.exported_at}</strong></div>
            <div><span>Checksum</span><strong className="texto-pequeno">{ultimo.checksum}</strong></div>
          </div>
        )}
      </section>

      <section className="tarjeta">
        <h2>Restaurar</h2>
        <p className="texto-alerta">⚠️ El archivo se valida antes de tocar la base. Un archivo nuevo alterado se rechaza por checksum.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          disabled={importando || exportando || limpiando}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importar(file);
          }}
        />
        {importando && <p>Restaurando…</p>}
      </section>

      <section className="tarjeta">
        <h2>Historial local</h2>
        {historial.length === 0 ? (
          <p className="texto-vacio">Todavía no hay respaldos registrados en este dispositivo.</p>
        ) : (
          <ul className="lista-resumen">
            {historial.map((item) => (
              <li key={item.checksum}>
                <span>{item.exported_at} · v{item.schema_version}</span>
                <strong className="texto-pequeno">{item.checksum.slice(0, 16)}…</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta">
        <h2>Limpiar aplicación</h2>
        <p className="texto-alerta">Solo se habilita con un respaldo verificado y exige dos confirmaciones.</p>
        <button className="boton-peligro" onClick={() => void limpiar()} disabled={limpiando || exportando || importando}>
          {limpiando ? 'Limpiando…' : 'Limpiar aplicación'}
        </button>
      </section>

      {mensaje && <p className="banner-exito">{mensaje}</p>}
      {error && <p className="texto-error">{error}</p>}
    </div>
  );
}
