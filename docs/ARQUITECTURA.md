# Arquitectura CAMELLO

## Carpetas

- `src/pages/`: pantallas y flujos.
- `src/components/`: componentes reutilizables.
- `src/db/schema.ts`: esquema SQLite actual.
- `src/db/database.ts`: acceso a datos, migraciones y reglas de negocio.
- `src/utils/`: fechas COP, tema, respaldo, ubicación y rotación automática.
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
v8: eliminación de programación de rutas y normalización de PROGRAMADA a CANCELADA.

## Mapa

Leaflet usa directamente lat/lng guardados. Los popups construyen DOM con `textContent`, no HTML con datos del usuario.

## Respaldo

Exportación JSON con checksum SHA-256. Restauración valida antes de tocar la base; hay respaldo de seguridad y recuperación de emergencia si la importación falla.
