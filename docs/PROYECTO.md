# CAMELLO v1.0.0

## Propósito

CAMELLO es una aplicación local para COMBOPITT orientada a registrar clientes, mascotas, ventas, pagos, cartera, rutas, gastos, ubicación y respaldos.

## Principios de v1

- Datos locales y operación offline-first.
- Dinero como enteros COP.
- SQLite como fuente de verdad de negocio.
- Migraciones v2 a v14 transaccionales.
- Respaldo verificable antes de restaurar o limpiar.
- Sin telemetría ni analítica.

## Plataformas

Android usa `@capacitor-community/sqlite`. Web/E2E usa SQLite basado en `sql.js` con persistencia binaria en IndexedDB/localStorage. Esto mantiene el mismo modelo SQL sin depender del ciclo de vida de `jeep-sqlite`.

## Alcance

Clientes, mascotas, productos, ventas, pagos, cartera, rutas, gastos, recordatorios, mapa, fotos, ubicación y respaldos.

Fuera de v1: sincronización entre teléfonos, backend, inventario avanzado, facturación electrónica, IA/chat, GPS permanente y comercio electrónico.
