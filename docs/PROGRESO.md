# Progreso CAMELLO

Rama de trabajo: `fix/sqlite-wasm-web`
PR: #4
Base: `main`
Estado: abierto, sin merge a `main`.

## FASE 0 — Estado real y pendientes

Fecha: 2026-09-24

### Estado verificado

- `docs/PROGRESO.md` no existía al iniciar esta fase; se crea con este bloque.
- No existe `AsistenteTarjetas` en `src/`.
- No existe el texto `Recordatorio de recompra` en `src/`.
- `Inicio` todavía contiene el bloque `Actividad`.
- `BottomNav` todavía contiene el acceso `Vender`.
- `TipoRuta` todavía contiene `Barrio`, `Vereda`, `Sector`, `Visita comercial`.
- `Rutas` todavía permite programación y hora planificada.
- C2 usa un formulario plano; no existe todavía el flujo de tarjetas ni fotos/ubicación avanzada especificado.
- C8 tiene exportar/importar básico, pero todavía no implementa todo el flujo de respaldo exigido.
- C9 tiene parte de la limpieza técnica ya realizada, pero todavía no puede declararse completo porque existen elementos explícitamente pendientes de C1-C8.

### C1-C9

| Fase | Estado | Evidencia principal |
|---|---|---|
| C1 | PARCIAL | `src/components/BottomNav.tsx` existe; no hay `AsistenteTarjetas` ni menú lateral. |
| C2 | PARCIAL | `src/components/ClienteForm.tsx` y ubicación básica existen; faltan tarjetas, fotos y ubicación avanzada. |
| C3 | PARCIAL | `src/pages/NuevaVenta.tsx` existe; no usa tarjetas ni soporta todos los métodos/voucher pedidos. |
| C4 | PARCIAL | `src/pages/Dashboard.tsx` tiene métricas y Cartera, pero conserva `Actividad` y no tiene `Recordatorio de recompra`. |
| C5 | PARCIAL | búsqueda por mascota y recordatorio básico existen; faltan ritmo personalizado y acciones pedidas. |
| C6 | PARCIAL | rutas funcionan, pero todavía existen tipos y programación que deben retirarse según especificación. |
| C7 | PARCIAL | mapa y filtros básicos existen; faltan filtros configurables, ubicación avanzada y popup completo. |
| C8 | PARCIAL | exportar/importar existe; faltan checksum, compartir, rotación automática y limpieza protegida. |
| C9 | PARCIAL | se eliminaron residuos Android de plantilla y no hay `any`/console en `src`, pero todavía quedan residuos funcionales de C1-C8. |

### Datos y migraciones

Se añaden fixtures reproducibles:

- `scripts/fixtures/schema-v1.sql`
- `scripts/fixtures/schema-v2.sql`

`scripts/verify-db.mjs` ahora comprueba:

1. base nueva y tablas obligatorias;
2. tipos INTEGER para dinero COP;
3. migración v1 → v3;
4. migración v2 → v3;
5. conteos de tablas y totales de ventas/utilidad antes y después;
6. `user_version = 3`;
7. anti-duplicado por `operacion_id`;
8. rollback real con sql.js.

### Plugin SQLite real

Se añade:

`android/app/src/androidTest/java/co/combopitt/camello/SQLiteTransactionPluginTest.java`

La prueba usa el plugin real `CapacitorSQLite` desde el WebView Android y reproduce el caso:

- transacción abierta + `execute(... transaction:true)` para el PRAGMA → debe fallar por transacción anidada;
- transacción abierta + `execute(... transaction:false)` → debe continuar correctamente.

Estado de ejecución: **NO EJECUTABLE AQUÍ** hasta disponer de emulador/dispositivo Android para ejecutar instrumented tests. La prueba queda preparada para ejecución real.

### Decisiones

- No se toca `main`.
- No se hace merge.
- Los cambios de cada fase deben ser pequeños y localizados.
- Si `npm run verify` falla por un cambio de la fase, se revierte el cambio.
- No se declara una prueba como PASÓ sin observar su salida real.

## Commits de FASE 0

- `66f0039` — fixtures SQLite v1.
- `e1a2bbb` — fixture SQLite v2.
- `cae1d7b` — prueba del plugin SQLite real para transacción anidada.
- `8440c93` — verificación de fixtures, conteos y totales.
- El commit de esta documentación se registra en el siguiente estado de la rama.

## Próxima compuerta

Ejecutar `npm run verify` sobre el SHA final de FASE 0 y observar CI. No iniciar C1 hasta completar esta compuerta.
