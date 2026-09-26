# PRUEBAS CAMELLO

## Puerta única
`npm run verify` integra SQL.js, audit, lint, ubicación, seguridad, módulos, BD, benchmark operativo, benchmark de escala y build.

## Evidencia real
- F0 sobre `2cebdf4...`: verify y APK debug PASARON.
- HEAD actual: Verify/UI/E2E/APK/Supply-chain terminan en `failure` sin steps; no hay salida de comandos actual que permita declararlos PASÓ.
- `verify-db`: fixtures v1/v2/v7/v8 dañada, salud SQLite, flujo venta+ruta+pagos+cuadre, gastos y anulaciones.
- `verify-security`: PBKDF2/AES-GCM, entradas peligrosas, HTML inseguro, logs y SQL parametrizado.
- `verify-modulos`: contrato, aislamiento y restauración sin duplicados.
- `benchmark-scale`: 36.000 clientes, 60.000 mascotas, 150.000 ventas, 150.000 pagos, 40.000 gastos y 12.000 fotos.

## Manual — NO EJECUTABLE AQUÍ
- GPS real ±m
- cámara/fotos
- Compartir
- ruta tras apagar
- PIN/biometría/recuperación
- backup cifrado tras reinstalar
- actualización sobre APK instalado.
