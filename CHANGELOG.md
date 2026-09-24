# Changelog CAMELLO

## 2026-09-24

### Interfaz
- Asistente reutilizable por tarjetas.
- Menú lateral con 10 secciones.
- Barra inferior reducida a Inicio, Clientes, Rutas y Cartera.
- FAB para Nueva venta / Nueva ruta.

### Clientes
- Alta por tarjetas.
- Mascotas múltiples.
- GPS de alta precisión, ubicación pegada y pin arrastrable.
- Fotos comprimidas y respaldo.

### Ventas y cartera
- Efectivo, Transferencia/Nequi, Fiado y Parcial.
- Voucher y compartir.
- Cobros FIFO e idempotencia.

### Métricas, recordatorios y rutas
- Ritmo de recompra automático/manual.
- Recordatorios con mensaje editable.
- Rutas operativas con métricas, historial y cuadre.

### Mapa
- Filtros combinables/persistentes.
- Clientes sin ubicación.
- Ubicación actual.
- Popups construidos con DOM seguro.

### Respaldo y seguridad
- SHA-256.
- Restauración validada.
- Respaldos automáticos rotativos.
- Limpieza con respaldo verificado + BORRAR.
- Android `allowBackup=false`.
- Release firmado preparado con secretos fuera del repo.

### Calidad
- Fixtures de migración.
- Prueba de plugin SQLite real.
- E2E Playwright.
- Smoke UI.
- Benchmark 2k/5k/20k.
