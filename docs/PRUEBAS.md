# Pruebas CAMELLO

## Comprobaciones automáticas

- `npm run verify`: dependencias, audit, lint, BD, benchmark de carga y build.
- `npm run verify:db`: base nueva, migraciones v1/v2→v8, conteos/totales, enteros COP, pagos, anti-duplicado, rollback y foreign keys.
- `npm run benchmark:db`: 2.000 clientes, 5.000 mascotas, 20.000 ventas y consultas representativas con umbral <1 s.
- `scripts/verify-ui-c1.mjs`: menú lateral, 10 secciones, ausencia de Vender, FAB y ancho escritorio.
- `scripts/e2e-core.mjs`: cliente, venta, doble toque, ruta, cuadre y respaldo.
- Instrumented Android: reproducción de transacción anidada con `@capacitor-community/sqlite`.

## Estado de ejecución

- F0: `npm run verify` PASÓ en CI sobre `2cebdf4...`; APK debug PASÓ.
- HEAD actual/final: las corridas de Verify/UI/E2E/APK están en cola en GitHub Actions; no se marca PASÓ.
- Instrumented Android: NO EJECUTABLE AQUÍ sin emulador/dispositivo.
- Release firmado: PENDIENTE DE SECRETOS de keystore.

## Guía manual

- [ ] Primera apertura / configuración inicial.
- [ ] Cliente por tarjetas.
- [ ] GPS real: precisión y coincidencia lat/lng.
- [ ] Pegar ubicación de WhatsApp/Google Maps.
- [ ] Foto de cliente/mascota/casa.
- [ ] Compartir hacia CAMELLO desde Android.
- [ ] Venta por tarjetas con Efectivo.
- [ ] Venta con Transferencia/Nequi.
- [ ] Venta Fiada.
- [ ] Venta Parcial.
- [ ] Doble toque en Confirmar.
- [ ] Pagar deuda total y parcial.
- [ ] Ruta que sobrevive a cerrar la app.
- [ ] Cierre con cuadre.
- [ ] Mapa con filtros y Cómo llegar.
- [ ] Mapa sin internet.
- [ ] Exportar/compartir/restaurar respaldo.
- [ ] Limpiar aplicación con BORRAR.
- [ ] Actualizar APK firmado encima de una versión instalada.
