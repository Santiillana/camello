# Datos y rescate

## Copia lógica

La base SQLite contiene clientes, mascotas, productos, rutas, ventas, pagos, configuración, fotos y seguimiento.

## Migraciones

Todas las migraciones son idempotentes y verifican estructuras antes de alterar tablas. `scripts/fixtures/schema-v1.sql` y `schema-v2.sql` permiten reproducir migraciones antiguas.

## Rescate

1. Exportar un respaldo nuevo.
2. Confirmar checksum.
3. Guardarlo fuera del teléfono.
4. Para restaurar, seleccionar el JSON y dejar que CAMELLO lo valide.
5. Si la importación falla, CAMELLO intenta reabrir la base y restaurar el estado anterior.

## Pérdida de datos

Las operaciones financieras críticas usan transacciones SQLite y `operacion_id` para evitar duplicados de doble toque.
