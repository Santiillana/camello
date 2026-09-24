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
