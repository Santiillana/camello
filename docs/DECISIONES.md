# Decisiones técnicas CAMELLO

## 2026-09-24

- SQLite v8 y migraciones idempotentes; nunca se editan migraciones publicadas.
- Dinero en enteros COP; fechas operativas en America/Bogota.
- Rutas nuevas solo EN_CURSO y tipos Puerta a puerta / Venta local móvil.
- Respaldos con checksum SHA-256 y restauración validada antes de sustituir la base.
- Respaldo automático rotativo en almacenamiento web separado.
- Android `allowBackup=false`: la app contiene teléfonos, ubicaciones, fotos y cartera; el respaldo oficial de CAMELLO es la vía explícita elegida para copia de datos.
- Keystore de release solo en secretos de GitHub.
- GPS/cámara/Compartir/actualización encima/apagado físico permanecen en guía manual.
- No se ocultan errores de CI: una corrida en cola no se interpreta como PASÓ.

- B0: v8 no debe usar ALTER TABLE RENAME sobre rutas porque puede reescribir FKs; la reparación v9 es idempotente y reconstruye tablas canónicamente.
- B0: se acepta la excepción documentada de que v8 solo estuvo en datos de prueba; v9 protege bases dañadas antes de la primera venta.
- B1: borradores se guardan en SQLite local como JSON para que el estado sobreviva recarga/cambio de app sin introducir otro backend.
- B2: el asistente usa overlay fijo + visualViewport para no quedar debajo del teclado.
- B3: GPS y resolución de enlaces cortos dependen de APIs nativas en APK; en navegador se explicita la limitación en lugar de simular disponibilidad.
- B4: el riel móvil permanece visible para que el contenido no quede tapado; la expansión se persiste localmente.
- B5: un workflow QUEUED no se interpreta como PASÓ; el bloqueo de runner queda visible y se conserva el E2E para ejecutarse cuando exista runner.

## Auditoría total 2026-09-24
- No se declara verde una corrida queued, failure sin pasos o sin logs verificables.
- Un job mínimo falló en ubuntu-24.04 y ubuntu-latest sin ejecutar steps; los workflows temporales fueron retirados.
- El backup SQLite completo ya contiene las tablas propias del módulo; restore no reinyecta modulos.<id> y evita duplicados.
- SQLCipher permanece desactivado por falta de validación cross-device.
