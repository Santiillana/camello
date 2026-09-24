# Changelog CAMELLO

## 2026-09-24

### Estabilidad B0-B6
- Corrige el bloqueo de ventas causado por referencias SQLite a rutas_migracion_v8.
- v9 repara bases dañadas y v10 añade borradores persistentes.
- Asistente en overlay de pantalla completa y recuperación por paso.
- GPS nativo con permisos, parser de coordenadas y resolución segura de enlaces cortos.
- Riel móvil fijo de 52 px con iconos SVG y expansión recordada.
- E2E ampliado a borradores, cuatro métodos de venta, cobros, rutas, mapa y respaldo.


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
