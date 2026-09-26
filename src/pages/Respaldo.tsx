import { useEffect, useMemo, useRef, useState } from 'react';
import { database } from '../db/database';
import { calcularChecksum, descargarArchivoTexto, descargarRespaldo, registrarExportacionRespaldo } from '../utils/respaldo';
import { listarRespaldosAutomaticos, type BackupItem } from '../utils/respaldoAutomatico';
import { cifrarRespaldo, descifrarRespaldo } from '../utils/respaldoCifrado';
import { camelloStorage, puedeGuardarEnCarpetaCompartida } from '../utils/almacenamientoNativo';
import { RESPALDO_PORTABLE_FORMAT } from '../utils/respaldoPortable';

type MetaRespaldo = {
  exported_at: string;
  schema_version: number;
  checksum: string;
};

const HISTORIAL_KEY = 'camello.respaldos.historial.v1';

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor);
}

function metaRespaldoDesdeObjeto(valor: unknown): MetaRespaldo | null {
  if (!esObjeto(valor)) return null;
  const origen = esObjeto(valor.manifest) ? valor.manifest : valor;
  const checksums = esObjeto(valor.checksums) ? valor.checksums : null;
  const checksum = typeof origen.checksum === 'string'
    ? origen.checksum
    : checksums && typeof checksums.package === 'string'
      ? checksums.package
      : '';
  if (typeof origen.exported_at !== 'string' || !Number.isInteger(Number(origen.schema_version)) || !checksum) return null;
  return {
    exported_at: origen.exported_at,
    schema_version: Number(origen.schema_version),
    checksum,
  };
}

function metaRespaldoDesdeJson(json: string): MetaRespaldo {
  const meta = metaRespaldoDesdeObjeto(JSON.parse(json));
  if (!meta) throw new Error('El respaldo no contiene metadatos válidos.');
  return meta;
}

function leerHistorial(): MetaRespaldo[] {
  try {
    const raw = localStorage.getItem(HISTORIAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(metaRespaldoDesdeObjeto).filter((meta): meta is MetaRespaldo => meta !== null) : [];
  } catch {
    return [];
  }
}

export default function Respaldo() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [exportandoClientes, setExportandoClientes] = useState(false);
  const [importando, setImportando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [meta, setMeta] = useState<MetaRespaldo | null>(null);
  const [historial, setHistorial] = useState<MetaRespaldo[]>(leerHistorial);
  const [automaticos, setAutomaticos] = useState<BackupItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const respaldoRef = useRef<string | null>(null);

  const ultimo = useMemo(() => meta ?? historial[0] ?? null, [meta, historial]);

  useEffect(() => {
    void listarRespaldosAutomaticos().then(setAutomaticos).catch(() => setAutomaticos([]));
  }, []);

  async function exportarPortable() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldoPortable();
      respaldoRef.current = json;
      const nuevaMeta = metaRespaldoDesdeJson(json);
      const nuevas = nuevaMeta ? [nuevaMeta, ...historial].slice(0, 8) : historial;
      if (nuevaMeta) {
        localStorage.setItem(HISTORIAL_KEY, JSON.stringify(nuevas));
        setHistorial(nuevas);
        setMeta(nuevaMeta);
      }
      descargarArchivoTexto(
        json,
        'camello-portable-respaldo-v1-' + new Date().toISOString().slice(0, 10) + '.json',
        'application/json;charset=utf-8',
      );
      registrarExportacionRespaldo();
      setMensaje('✓ Respaldo portable generado. Es el archivo maestro para actualizar, desinstalar o reinstalar CAMELLO.');
    } catch (e: unknown) {
      setError('No se pudo generar el respaldo portable: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  async function guardarPortableEnCarpeta() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldoPortable();
      const fecha = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
      await camelloStorage.saveBackup({
        filename: 'camello-portable-respaldo-v1-' + fecha + '.json',
        data: json,
        mimeType: 'application/json',
      });
      respaldoRef.current = json;
      setMensaje('Respaldo portable guardado fuera del almacenamiento privado de CAMELLO.');
    } catch (e: unknown) {
      setError('No se pudo guardar el respaldo portable: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  async function exportar() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldo();
      respaldoRef.current = json;
      const nuevaMeta = metaRespaldoDesdeJson(json);
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

  async function guardarEnCarpeta() {
    setExportando(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarRespaldo();
      const fecha = new Date().toISOString().replaceAll(':','-').slice(0,19);
      const result = await camelloStorage.saveBackup({
        filename: 'camello-respaldo-' + fecha + '.json',
        data: json,
      });
      respaldoRef.current = json;
      setMensaje('Respaldo guardado en la carpeta que elegiste. Esa carpeta queda fuera del almacenamiento privado de CAMELLO.');
      void result;
    } catch (e: unknown) {
      setError('No se pudo guardar el respaldo en la carpeta elegida: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportando(false);
    }
  }

  async function exportarClientesJson() {
    setExportandoClientes(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarClientes();
      const fecha = new Date().toISOString().slice(0, 10);
      descargarArchivoTexto(json, 'camello-clientes-completo-' + fecha + '.json', 'application/json;charset=utf-8');
      setMensaje('Exportación completa de clientes generada en JSON. Conserva este archivo como copia portable de los datos.');
    } catch (e: unknown) {
      setError('No se pudo exportar la base de clientes: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportandoClientes(false);
    }
  }

  async function guardarClientesJsonEnCarpeta() {
    setExportandoClientes(true);
    setMensaje(null);
    setError(null);
    try {
      const json = await database.exportarClientes();
      const fecha = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
      await camelloStorage.saveBackup({
        filename: 'camello-clientes-completo-' + fecha + '.json',
        data: json,
        mimeType: 'application/json',
      });
      setMensaje('Exportación completa de clientes guardada en la carpeta elegida.');
    } catch (e: unknown) {
      setError('No se pudo guardar la exportación de clientes: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportandoClientes(false);
    }
  }

  async function exportarClientesCsv() {
    setExportandoClientes(true);
    setMensaje(null);
    setError(null);
    try {
      const csv = await database.exportarClientesCsv();
      const fecha = new Date().toISOString().slice(0, 10);
      descargarArchivoTexto(csv, 'camello-clientes-' + fecha + '.csv', 'text/csv;charset=utf-8');
      setMensaje('CSV de clientes generado para Excel, Google Sheets y otras herramientas.');
    } catch (e: unknown) {
      setError('No se pudo generar el CSV de clientes: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExportandoClientes(false);
    }
  }

  async function exportarCifrado(){
    const password=window.prompt('Contraseña para el respaldo cifrado (mínimo 10 caracteres)');
    if(!password)return;
    setExportando(true);setMensaje(null);setError(null);
    try{
      const json=await database.exportarRespaldoPortable();
      const cifrado=await cifrarRespaldo(json,password);
      respaldoRef.current=cifrado;
      descargarRespaldo(cifrado);
      setMensaje('Respaldo cifrado descargado. Conserva la contraseña: sin ella no se puede restaurar.');
    }catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
    finally{setExportando(false);}
  }
  async function compartir() {
    if (!respaldoRef.current) {
      await exportar();
    }
    const texto = respaldoRef.current;
    if (!texto) return;

    const parsedCompartir: unknown = (() => {
      try { return JSON.parse(texto); } catch { return null; }
    })();
    const esCifrado = esObjeto(parsedCompartir) && Number(parsedCompartir.camello_encrypted_backup_version) === 1;
    const esPortable = esObjeto(parsedCompartir)
      && esObjeto(parsedCompartir.manifest)
      && parsedCompartir.manifest.format === RESPALDO_PORTABLE_FORMAT;
    let version = 0;
    let checksum = '';
    if (!esCifrado) {
      if (esPortable) {
        const ver = await database.validarRespaldoPortable(texto);
        version = ver.paquete.manifest.format_version;
        checksum = ver.paquete.checksums.package;
      } else {
        const ver = await database.validarRespaldo(texto);
        version = ver.version;
        checksum = ver.checksum ?? '';
      }
    }
    const fecha = version + '-' + new Date().toISOString().slice(0, 10);
    const archivo = new File([texto], esPortable ? 'camello-portable-v1-' + fecha + '.json' : 'camello-respaldo-' + fecha + '.json', {
      type: 'application/json',
    });

    if (navigator.share && navigator.canShare?.({ files: [archivo] })) {
      await navigator.share({
        title: 'Respaldo CAMELLO',
        text: esCifrado ? 'Respaldo cifrado AES-GCM' : esPortable ? 'Respaldo portable verificado · SHA-256 ' + checksum : 'Respaldo verificado · SHA-256 ' + checksum,
        files: [archivo],
      });
      setMensaje('Respaldo compartido desde el dispositivo.');
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: 'Respaldo CAMELLO',
        text: esCifrado ? 'Respaldo cifrado AES-GCM' : esPortable ? 'Respaldo portable verificado · SHA-256 ' + checksum : 'Respaldo verificado · SHA-256 ' + checksum,
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
      let plano=texto;
      const parsed: unknown = JSON.parse(texto);
      if (esObjeto(parsed) && parsed.camello_encrypted_backup_version === 1) {
        const password=window.prompt('Contraseña del respaldo cifrado');
        if(!password) throw new Error('Restauración cancelada.');
        plano=await descifrarRespaldo(texto,password);
      }
      const objetoPlano: unknown = JSON.parse(plano);
      if (esObjeto(objetoPlano) && esObjeto(objetoPlano.manifest) && objetoPlano.manifest.format === RESPALDO_PORTABLE_FORMAT) {
        const resultado = await database.importarRespaldoPortable(plano);
        respaldoRef.current = plano;
        const metaPortable = metaRespaldoDesdeJson(plano);
        if (metaPortable) setMeta(metaPortable);
        setMensaje(
          resultado.tablasOmitidas.length
            ? '✓ Respaldo portable restaurado. Algunas tablas antiguas no existen en esta versión: ' + resultado.tablasOmitidas.join(', ')
            : '✓ Respaldo portable restaurado. Reinicia la app para refrescar pantallas que ya estaban abiertas.',
        );
        return;
      }

      const ver = await database.validarRespaldo(plano);
      await database.importarRespaldo(plano);
      respaldoRef.current = plano;
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
          La información de CAMELLO vive localmente en este teléfono. Para cambiar de versión, desinstalar o reinstalar, conserva el <strong>respaldo portable</strong>: es el formato maestro versionado y verificable para transportar toda la información entre instalaciones.
        </p>
        <p className="texto-alerta">
          ⚠️ El respaldo automático interno protege contra errores dentro de CAMELLO, pero NO protege contra la pérdida, robo o daño físico del teléfono. Para protegerte ante esos casos, usa la exportación o backup externo y conserva el archivo fuera del dispositivo.
        </p>
      </section>

      <section className="tarjeta">
        <h2>Exportar</h2>
        <div className="fila-botones">
          <button className="boton-primario" onClick={() => void exportarCifrado()} disabled={exportando || exportandoClientes || importando || limpiando}>
            {exportando ? 'Generando…' : '🔒 Descargar respaldo cifrado (recomendado)'}
          </button>
          <button className="boton-secundario" onClick={() => void exportarPortable()} disabled={exportando || exportandoClientes || importando || limpiando}>
            ⬇️ Respaldo portable para actualizar/reinstalar
          </button>
          <button className="boton-secundario" onClick={() => void exportar()} disabled={exportando || importando || limpiando}>Respaldo compatible clásico</button>
          <button className="boton-secundario" onClick={() => void compartir()} disabled={exportando || importando || limpiando}>Compartir</button>
          {puedeGuardarEnCarpetaCompartida() && <button className="boton-secundario" onClick={() => void guardarPortableEnCarpeta()} disabled={exportando || importando || limpiando}>Guardar portable en carpeta…</button>}
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
        <h2>Clientes: exportación completa</h2>
        <p className="texto-vacio">El JSON es la exportación maestra: conserva clientes, mascotas, fotos, seguimiento, ventas, pagos, pedidos, artículos y rutas referenciadas sin depender de cómo se vea la aplicación.</p>
        <div className="fila-botones">
          <button className="boton-primario" onClick={() => void exportarClientesJson()} disabled={exportando || exportandoClientes || importando || limpiando}>
            {exportandoClientes ? 'Generando…' : 'Descargar clientes completos (JSON)'}
          </button>
          <button className="boton-secundario" onClick={() => void exportarClientesCsv()} disabled={exportando || exportandoClientes || importando || limpiando}>
            CSV para Excel
          </button>
          {puedeGuardarEnCarpetaCompartida() && (
            <button className="boton-secundario" onClick={() => void guardarClientesJsonEnCarpeta()} disabled={exportando || exportandoClientes || importando || limpiando}>
              Guardar JSON en carpeta…
            </button>
          )}
        </div>
        <p className="detalle-cliente">JSON = copia completa y portable. CSV = tabla sencilla de clientes para herramientas de oficina. La exportación nunca modifica la base de datos.</p>
      </section>

      <section className="tarjeta">
        <h2>Restaurar</h2>
        <p className="texto-alerta">⚠️ El archivo se valida antes de tocar la base. El respaldo portable verifica estructura y checksum antes de restaurar; los respaldos clásicos siguen disponibles por compatibilidad.</p>
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
        <h2>Respaldos automáticos</h2>
        {automaticos.length === 0 ? (
          <p className="texto-vacio">Todavía no hay respaldos automáticos guardados.</p>
        ) : (
          <ul className="lista-resumen">
            {automaticos.map((item) => (
              <li key={item.id} className="fila-recordatorio">
                <span>{item.kind === 'monthly' ? 'Mensual' : item.kind === 'weekly' ? 'Semanal' : 'Diario'} · {item.date}</span>
                <button
                  className="boton-chip"
                  onClick={() => {
                    respaldoRef.current = item.json;
                    const parsed: unknown = JSON.parse(item.json);
                    setMeta({
                      exported_at: item.date,
                      schema_version: esObjeto(parsed) ? Number(parsed.schema_version ?? 0) : 0,
                      checksum: item.checksum,
                    });
                    setMensaje('Respaldo automático seleccionado y verificado. Puedes restaurarlo o descargarlo.');
                  }}
                >
                  Seleccionar
                </button>
              </li>
            ))}
          </ul>
        )}
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
