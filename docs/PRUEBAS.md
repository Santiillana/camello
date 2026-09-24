# Pruebas CAMELLO

## Comprobaciones automáticas

- `npm run verify`: dependencias, audit, lint, BD, benchmark de carga y build.
- `npm run verify:db`: base nueva, migraciones v1/v2/v7, base dañada por v8, reparación v9, borradores v10, conteos/totales, pagos, anti-duplicado, rollback, foreign keys e integrity_check.
- `npm run verify:ubicacion`: parser de coordenadas, geo:, Google Maps, texto de WhatsApp, rango e inversión.
- `npm run benchmark:db`: 2.000 clientes, 5.000 mascotas, 20.000 ventas y consultas representativas con umbral <1 s.
- `scripts/verify-ui-c1.mjs`: menú lateral, 10 secciones, ausencia de Vender, FAB y ancho escritorio.
- `scripts/e2e-core.mjs`: borrador/reload, cuatro métodos de venta, doble toque, cobro desde Inicio/Cartera, venta en ruta, cuadre, mapa y respaldo.
- Instrumented Android: reproducción de transacción anidada con `@capacitor-community/sqlite`.

## Estado de ejecución

- F0: `npm run verify` PASÓ en CI sobre `2cebdf4...`; APK debug PASÓ.
- B3 parser: PASÓ localmente con Node 22.16.0; `node --experimental-strip-types scripts/verify-ubicacion.ts`.
- HEAD actual/final: las corridas de Verify/UI/E2E/APK están en cola en GitHub Actions; no se marca PASÓ.
- Instrumented Android: NO EJECUTABLE AQUÍ sin emulador/dispositivo.
- Release firmado: PENDIENTE DE SECRETOS de keystore.

## Guía manual B6

- [ ] Abrir el APK y conceder permiso de ubicación (precisión aproximada visible como ±m).
- [ ] Probar GPS real en un punto abierto y comprobar lat/lng y fuente GPS.
- [ ] En WhatsApp, compartir una ubicación hacia CAMELLO y seleccionar el cliente.
- [ ] Pegar un enlace largo de Google Maps.
- [ ] Pegar un enlace corto maps.app.goo.gl con internet en el APK y verificar que el pin se resuelva.
- [ ] En navegador HTTP, comprobar el mensaje que indica que GPS requiere la app instalada.
- [ ] Tomar una foto y comprobar que aparece en la ficha y en el respaldo.
- [ ] Venta con Efectivo.
- [ ] Venta con Transferencia/Nequi.
- [ ] Venta Fiada.
- [ ] Venta Parcial.
- [ ] Doble toque en CONFIRMAR VENTA: una sola venta.
- [ ] Venta dentro de ruta activa y cierre con diferencia 0.
- [ ] Empezar un cliente, cerrar/recargar la app y usar Continuar.
- [ ] Atrás de Android retrocede una tarjeta antes de salir.
- [ ] Abrir menú en 360 px: riel visible, expandir, leer 10 nombres y verificar contenido completo.

## Guía manual anterior

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
