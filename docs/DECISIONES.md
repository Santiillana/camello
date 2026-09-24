# Decisiones técnicas CAMELLO

## 2026-09-24

### SQLite y migraciones
Las versiones publicadas no se editan. Los cambios de esquema avanzan con migraciones idempotentes. La versión actual objetivo es 8.

### Rutas
La interfaz ya no programa rutas. Las rutas nuevas nacen en curso y solo existen estos tipos: Puerta a puerta y Venta local móvil. Las rutas históricas que estaban PROGRAMADA se convierten en CANCELADA durante v8, para no inventar que fueron realizadas.

### Respaldos
Los respaldos nuevos usan un sobre CAMELLO con versión, fecha y checksum SHA-256. La base se valida antes de restaurar y se conserva un respaldo de seguridad durante el intento de restauración.

Los respaldos automáticos se almacenan en IndexedDB separado del SQLite de negocio y rotan a 7 diarios + 1 semanal. Esto evita agregar otro plugin solo para la rotación.

### Firmado Android
El keystore de release nunca se guarda en el repositorio. El workflow usa secretos de GitHub y genera el archivo temporal en el runner.

### Manual / pendiente de hardware
GPS real, cámara, Compartir hacia WhatsApp/Android, instalación encima de una versión existente y apagado físico del teléfono requieren comprobación manual en dispositivo.
