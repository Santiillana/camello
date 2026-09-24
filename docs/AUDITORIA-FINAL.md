# Auditoría final CAMELLO — borrador de cierre

## Críticos
### SQLite v8 / ventas bloqueadas
- Archivo: `src/db/database.ts`
- Evidencia: FK de `ventas` llegó a apuntar a `rutas_migracion_v8`.
- Estado: corregido mediante reconstrucción segura en v8 y reparación idempotente v9.
- Prueba: fixture `schema-v8-damaged.sql`, `foreign_key_check`, `integrity_check`, flujo de venta/ruta/pago/cierre.

## Importantes
### Integridad de respaldo
- Estado: checksum, restauración validada y respaldo cifrado AES-GCM implementados.
- Limitación: SQLCipher no activado; falta prueba completa de migración cifrada entre APKs.

### Protección Android
- Estado: allowBackup=false, cleartext desactivado, CSP, FLAG_SECURE en release, WebView debugging desactivado en release.
- Pendiente: validación física del comportamiento de APK en dispositivo.

### Escala
- Estado: índices de nombre normalizado y paginación de clientes; benchmark de 36.000/60.000/150.000 preparado.
- Pendiente: observar su salida en CI.

## Menores
- Algunas pantallas aún pueden recibir más pulido de carga/vacío.
- La accesibilidad visual a 360 px requiere smoke real.
- Algunos controles administrativos de categorías/gastos todavía son más simples que la especificación ideal.

## Calidad de código
No se deben aceptar resultados de CI en cola como PASÓ. La última corrección de Verify debe observarse sobre un clon limpio antes de poner etiquetas de fase.

## Pruebas manuales
GPS real, cámara, Compartir Android, biometría, actualización encima, restauración cifrada tras reinstalar y apagado físico siguen en guía manual.

## Resultado
Este documento debe actualizarse con los hashes y salidas finales una vez exista una corrida verde del HEAD final.
