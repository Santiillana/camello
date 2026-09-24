# CAMELLO

Aplicación Android local, offline-first, para que **COMBOPITT** registre clientes, mascotas, ventas y rutas de venta de productos naturales para mascotas.

## Incluye

- Inicio con Hoy / Semana / Mes, dinero vendido, paquetes, cobrado, pendiente, costo y utilidad.
- Recordatorio de recompra y Cartera con cobro por tarjetas.
- Alta y edición de clientes/mascotas con AsistenteTarjetas.
- Fotos comprimidas, ubicación GPS/manual/WhatsApp y mini mapa.
- Nueva venta por tarjetas con Efectivo, Transferencia/Nequi, Fiado y Pago parcial.
- Voucher y compartir.
- Rutas operativas en curso/finalizadas/canceladas, métricas y cuadre.
- Mapa con filtros persistentes y popup seguro.
- Respaldo con checksum, restauración y rotación automática.
- Configuración inicial y productos.
- SQLite nativo con migraciones v2→v8.
- CI para verify, UI smoke, E2E y APK.
- Release firmado preparado para secretos de GitHub.

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

Para release firmado se requieren los cuatro secretos descritos en `docs/RELEASE.md`.

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
