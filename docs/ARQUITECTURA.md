# Arquitectura CAMELLO

## Carpetas

- `src/pages/`: pantallas y flujos.
- `src/components/`: componentes reutilizables.
- `src/db/schema.ts`: esquema SQLite actual.
- `src/db/database.ts`: acceso a datos, migraciones y reglas de negocio.
- `src/utils/`: fechas COP, tema, respaldo, ubicación, parser de coordenadas y rotación automática.
- `src/hooks/`: persistencia de borradores y ciclo de vida de Capacitor.
- `android/`: proyecto Capacitor Android.
- `scripts/`: verificación de datos, UI y rendimiento.
- `.github/workflows/`: CI, APK y smoke de interfaz.

## Arranque

`src/App.tsx` inicializa SQLite, carga configuración, aplica tema y monta el router. En producción los datos vienen de SQLite local; el modo `VITE_UI_SMOKE=1` existe solo para smoke visual de CI.

## Datos

Dinero: enteros COP. Fechas: ISO y zona funcional America/Bogota. Ventas congelan precio/costo histórico. Cobros se registran en `pagos` y disminuyen FIFO el saldo de las ventas más antiguas.

## Migraciones

v2: campos de ruta heredados.
v3: dinero INTEGER, métodos de pago y operación idempotente.
v4: precisión/fuente/fecha de ubicación y fotos.
v5: historial de pagos.
v6: preferencias de ritmo/seguimiento.
v7: sobrantes de ruta.
v8: eliminación de programación de rutas y normalización de PROGRAMADA a CANCELADA; reconstrucción segura sin RENAME sobre tablas referenciadas.
v9: reparación idempotente de referencias a tablas temporales de migración, foreign_key_check e integrity_check.
v10: borradores persistentes con tipo, clave, JSON, paso y fecha; purga a 7 días.

## Formularios y borradores

Los formularios y asistentes usan la tabla local `borradores`, con debounce de 300 ms y guardado al ocultar la página o la app. Al volver aparece Continuar/Descartar y se restaura el paso exacto.

## Ubicación

`ubicacionParser.ts` es un parser puro para coordenadas, geo:, Google Maps y texto de WhatsApp. En Android, `ubicacion.ts` usa Geolocation para permisos/GPS y CapacitorHttp para resolver enlaces cortos con límite de redirecciones y lista de dominios permitidos.

## Mapa

Leaflet usa directamente lat/lng guardados. Los popups construyen DOM con `textContent`, no HTML con datos del usuario.

## Respaldo

Exportación JSON con checksum SHA-256. Restauración valida antes de tocar la base; hay respaldo de seguridad y recuperación de emergencia si la importación falla.
