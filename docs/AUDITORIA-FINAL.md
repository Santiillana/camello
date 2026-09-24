# AUDITORÍA FINAL — CAMELLO

Fecha: 2026-09-24

## CRÍTICO

### SQLite v8 / ventas bloqueadas — corregido
- Archivo: src/db/database.ts
- Evidencia: la v8 podía dejar FKs de ventas apuntando a rutas_migracion_v8.
- Control: v8 reconstruye rutas; v9 detecta y corrige referencias temporales; foreign_key_check e integrity_check.
- Prueba: scripts/verify-db.mjs con fixture dañada por v8 y flujo de venta/ruta/pagos/cuadre.

### Pérdida de formularios — corregido
- Tabla borradores v10, autosalvado y restauración de paso.
- E2E cubre recarga y continuidad.

### Pérdida de historial por anulación — corregido
- v12 agrega estado_registro, motivo y fecha para ventas/pagos/gastos.
- Los anulados se excluyen de cartera y métricas sin DELETE.

## IMPORTANTE

### Rendimiento — mitigado
- v14 normaliza nombres sin tildes y crea índices.
- listados de clientes/mascotas paginados.
- enriquecimiento de una página usa agregados SQL.
- benchmark-db es puerta de verify.

### Respaldos — mitigado
- checksum SHA-256, validación estricta, límite 25 MB.
- rotación 7 diarios + 4 semanales + 3 mensuales.
- respaldo cifrado AES-GCM recomendado.
- restauración cifrada validada por contraseña.
- allowBackup=false.

### Seguridad de acceso — mitigado
- PIN de 6 dígitos con PBKDF2 y sal.
- bloqueo creciente por intentos.
- bloqueo tras inactividad configurable.
- FLAG_SECURE y WebView debugging desactivado en release.

### Módulos — implementado
- contrato aislado, tablas mod_<id>_, migraciones propias, error boundary, activar/desactivar, export/import/limpiar.
- build del núcleo sin carpeta probado en CI.

### Android release — mitigado
- debug APK siempre requerido.
- versionName semántico 1.0.0 y versionCode basado en run number.
- SHA-256 publicado.
- release firmado condicionado a secretos; keystore temporal eliminado.

## MENOR / PENDIENTE

- Pruebas físicas de GPS, cámara, compartir, batería apagada, actualización encima de instalación y PIN olvidado.
- SQLCipher no activado porque no se puede validar aquí una migración cifrada completa con restauración entre teléfonos.
- Agrupamiento de mapa a gran escala no implementado; se mantiene tope/listado visible.
- Dependabot/SBOM quedan como mejora de suministro y documentación.
