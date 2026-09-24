# CAMELLO

Aplicación Android local, offline-first, para que **COMBOPITT** registre clientes, mascotas, ventas y rutas de venta de productos naturales para mascotas.

## Incluye

- Inicio con Hoy / Semana / Mes, dinero vendido, paquetes, cobrado, pendiente, costo y utilidad.
- Recordatorio de recompra y Cartera con cobro por tarjetas.
- Alta y edición de clientes/mascotas con AsistenteTarjetas.
- Fotos comprimidas, ubicación GPS/manual/WhatsApp y mini mapa; GPS nativo pide permisos y los enlaces cortos de Google Maps se resuelven en APK con límite de redirecciones.
- Nueva venta por tarjetas con Efectivo, Transferencia/Nequi, Fiado y Pago parcial.
- Voucher y compartir.
- Rutas operativas en curso/finalizadas/canceladas, métricas y cuadre.
- Mapa con filtros persistentes y popup seguro.
- Respaldo con checksum, restauración y rotación automática.
- Configuración inicial y productos.
- SQLite nativo en Android y SQLite web con persistencia IndexedDB, con migraciones v2→v14, reparación v9 para referencias temporales y borradores persistentes.
- CI para verify, UI smoke, E2E y APK; los tests de migración y parser se conservan como puertas del verify.
- Release firmado preparado para secretos de GitHub; el keystore permanece fuera del repositorio.

## Arquitectura

React + Vite + TypeScript, Capacitor Android, SQLite mediante `@capacitor-community/sqlite`, Leaflet/OpenStreetMap y GitHub Actions.

## Datos y seguridad

El dinero se guarda como enteros COP. El respaldo oficial de CAMELLO usa checksum SHA-256. Android tiene `allowBackup=false`; el keystore de release nunca vive en el repositorio.

## Desarrollo

```bash
npm install
npm run dev
npm run verify
npm run benchmark:db
npx cap sync android
```

Para release firmado se requieren los cuatro secretos descritos en `docs/RELEASE.md`. La ejecución final de Verify/UI/E2E/APK de este cierre quedó QUEUED y no se interpreta como PASÓ hasta observar su conclusión.

## Estructura

```
src/components/  componentes y asistentes reutilizables
src/pages/       pantallas
src/db/          esquema, migraciones y acceso a datos
src/utils/       fechas, ubicación, tema y respaldo
android/         proyecto Capacitor
scripts/         verify, E2E, smoke UI y benchmark
docs/            arquitectura, datos, pruebas, release y decisiones
```

## Fuera de alcance

Contabilidad, proveedores, nómina, impuestos, facturación electrónica, inventario avanzado, sincronización entre teléfonos, servidor, IA/chat, GPS permanente y comercio electrónico.


## Seguridad y privacidad

CAMELLO funciona sin analítica ni telemetría. Los datos permanecen en el dispositivo salvo acciones explícitas de respaldo, compartir o apertura de servicios externos. El aviso de privacidad es configurable en Configuración y no sustituye revisión jurídica.
