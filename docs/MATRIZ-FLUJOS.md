# MATRIZ DE FLUJOS

| Flujo | Automático | Manual físico | Estado |
|---|---|---|---|
| Primer uso/configuración | E2E | — | preparado |
| Cliente por tarjetas | E2E | — | preparado |
| Borrador + recarga | E2E | cierre de app real | preparado/manual físico |
| Venta Efectivo | E2E | — | preparado |
| Transferencia/Nequi | E2E | — | preparado |
| Fiado | E2E | — | preparado |
| Parcial | E2E | — | preparado |
| Doble toque | E2E | — | preparado |
| Cobro cartera FIFO | E2E | — | preparado |
| Ruta activa + cierre | E2E | apagar teléfono | manual físico para apagado |
| GPS | parser unitario | teléfono | manual |
| Cámara/foto | compresión | teléfono | manual |
| Respaldo plano | verify-db | — | automático |
| Respaldo cifrado | verify-security | restauración física | manual adicional |
| Gastos | verify-db/E2E | foto de recibo | manual parcial |
| Anulación | verify-db/E2E | — | automático |
| Mapa/filtros | UI/E2E | precisión móvil | mixto |
| Menú 360 px | UI smoke | — | automático |
| PIN | verify-security | biometría/olvido | manual |
| Módulo sorpresa | verify-modulos + build sin carpeta | activar/desactivar y UX | mixto |
