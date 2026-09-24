# Progreso CAMELLO

Rama: `fix/sqlite-wasm-web` · PR #4 · base `main`
No se ha hecho merge a `main`.

## Estado inicial F0

Se verificó que al inicio no existían `AsistenteTarjetas` ni `Recordatorio de recompra`; Inicio tenía `Actividad`, la barra inferior tenía `Vender`, Rutas tenía programación y tipos antiguos, y el respaldo era básico. F0 añadió fixtures v1/v2, comprobaciones de migración por conteos/totales y una prueba instrumentada contra el plugin SQLite real.

F0 quedó respaldada por:
- `8120ae3` — cierre F0, `[phase-ok:fase-0-ok]`.
- `2cebdf4c847d0c5a7569cf1a2681e8f266de9ee6` — `npm run verify` PASÓ y APK debug PASÓ en CI.

## C1 — Interfaz base y navegación

Implementación principal:
- `d49d9a8` AsistenteTarjetas.
- `991a7ee` menú lateral.
- `f1601e9` quitar Vender de barra inferior y añadir FAB.
- `d2db17e` shell de navegación.
- `1b7014b` retirar accesos finales de Inicio.
- `32e73cf` encabezado móvil y atrás.
- `51a2af1` estilos.
- `712c5ab` smoke de interfaz.

Estado funcional: IMPLEMENTADO.
Prueba automática disponible: `scripts/verify-ui-c1.mjs`.
Gate final: BLOQUEADO por cola de GitHub; no se marca PASÓ sin ejecución de pantalla sobre el SHA final.
Etiqueta: NO CREADA por no haber compuerta verde final.

## C2 — Clientes, mascotas, fotos y ubicación

Implementación principal:
- `25016d1` alta de cliente con tarjetas.
- `348f0c3` GPS y pin arrastrable.
- `74585d2` selector/compresión de fotos.
- `bd34d0c` mini mapa y galería.
- `7250956` Cómo llegar.
- `fe63db0` / `a2520c4` migración de ubicación y fotos.
- `c11e030`, `cdef35d`, `42ad1fc` compartir Android.
- `61c77c2` prueba de migración hasta v4.

Estado funcional: IMPLEMENTADO.
Pendiente de teléfono: GPS real, cámara y Compartir desde Android.
Gate CI final: BLOQUEADO por cola.

## C3 — Nueva venta por tarjetas

Implementación principal:
- `2611e87` nueva venta por tarjetas, métodos y voucher.
- `e2f4c63` estilos y flujo de pagos/recordatorios.
- Idempotencia por `operacion_id` en base de datos.

Estado funcional: IMPLEMENTADO.
E2E preparado: `scripts/e2e-core.mjs`.
Gate CI final: BLOQUEADO por cola.

## C4 — Inicio y Cartera

Implementación principal:
- `77a0b50` reemplazo de Actividad por Recordatorio de recompra.
- `70882d5` historial de pagos.
- `8accb73` migración de pagos.
- `3c94b4f` cobro FIFO.
- `e5edee3` Cartera con filtros y cobro por tarjetas.
- `4c046c6` prueba de pagos parciales.
- `5c1c9e1` prueba de idempotencia de cobro.

Estado funcional: IMPLEMENTADO.
Gate CI final: BLOQUEADO por cola.

## C5 — Métricas y recordatorios personalizados

Implementación principal:
- `cc5e112` preferencias de seguimiento.
- `82d197e` migración de seguimiento.
- `0785dd1` ritmo y seguimiento.
- `b09ae2d` métricas y búsqueda normalizada.
- `1387216` editor de ritmo.
- `9c59f5c` recordatorios por retraso, ritmo y contacto.
- `b2ad0ca` mensaje editable.
- `718fc8b`, `0a8675f`, `eff9942` correcciones de calendario/mensaje.
- `72ae821` normaliza teléfonos antes de WhatsApp.

Estado funcional: IMPLEMENTADO.
Gate CI final: BLOQUEADO por cola.

## C6 — Rutas

Implementación principal:
- `5608bfe` tipos de ruta y métricas.
- `2144efe` migración de sobrantes.
- `c2e9d8a` rutas operativas sin programación.
- `9bf27eb` métricas en vivo y cuadre.
- `2a6744d` cierre con métricas y cuadre.

Estado funcional: IMPLEMENTADO.
Rutas válidas: Puerta a puerta y Venta local móvil.
Estado de ruta: EN_CURSO / FINALIZADA / CANCELADA.
Gate CI final: BLOQUEADO por cola.

## C7 — Mapa

Implementación principal:
- `c16f3f6` popup DOM seguro.
- `bd384c9` filtros persistentes y ubicación.
- `b9884e3` listeners y clientes sin ubicación.
- `3fc1332` foto segura en popup.
- `38c6da7`, `017783ce` reparación del estado omitido y del botón de centrado.

Estado funcional: IMPLEMENTADO.
Comprobación estática: popup sin HTML construido con datos de usuario.
Gate CI final: BLOQUEADO por cola.

## C8 — Respaldo

Implementación principal:
- `d773860` checksum SHA-256.
- `8db0daf` restauración protegida.
- `3e43d03` compartir y limpieza protegida.
- `026dada` / `19b8c6b` rotación automática.
- `8cf8711` compartir archivo.
- `ebc89e2` historial automático.
- `aa42519`, `bea99c2` evitar exportaciones automáticas innecesarias.

Estado funcional: IMPLEMENTADO.
Respaldo: fecha, versión, checksum; restauración validada; limpieza con verificación + confirmación BORRAR.
Gate CI final: BLOQUEADO por cola.

## C9 — Limpieza

Implementación principal:
- `f1e03b8` eliminación de programación del esquema actual.
- `cfbffff` / `a91d133` eliminación de código/tipos heredados.
- `3f6dbe4`, `13feba2`, `8ca783d` selector de pago reutilizable.
- `5bdea8b`, `f52917c`, `9bebb35`, `73761cc` limpieza y pruebas del esquema v8.
- Residuos Android de plantilla también fueron eliminados.
- Auditoría final corrigió `allowBackup=false`, benchmark y Mapa/WhatsApp.

Estado funcional: IMPLEMENTADO.
Búsqueda estática actual: sin `any`, `console.log`, TODO/FIXME/XXX, `innerHTML` o `dangerouslySetInnerHTML` en `src`.
Gate CI final: BLOQUEADO por cola.

## Auditoría A1-A7

### A1 — C1-C9
Todas las funcionalidades pedidas aparecen implementadas en el árbol actual. No se declara ninguna como PASÓ en pantalla mientras la corrida final de CI permanezca en cola.

### A2 — hallazgos
- CRÍTICO: ninguno encontrado en revisión estática.
- IMPORTANTE: popup del mapa y estado de filtros llegaron a quedar incompletos en una rama intermedia; corregidos.
- IMPORTANTE: `allowBackup=true` era una vía adicional para datos sensibles; corregido a `false`.
- MENOR: normalización de teléfono de WhatsApp en Recordatorios; corregida.
- Pendiente: validación física Android y firma release con secretos reales.

### A3 — rendimiento
`scripts/benchmark-db.mjs` siembra 2.000 clientes, 5.000 mascotas y 20.000 ventas y prueba consultas representativas de Inicio, Clientes, Cartera, Rutas, Informes y Mapa. Se incorporó a `npm run verify`.
Estado de ejecución: BLOQUEADO por runner de GitHub en cola.

### A4 — E2E
`scripts/e2e-core.mjs` cubre base limpia E2E, cliente, venta, doble toque, ruta, cuadre y respaldo. La matriz completa también contempla casos manuales de GPS/cámara/WhatsApp/apagado/actualización.
Estado automático final: BLOQUEADO por runner.
Estado manual: NO EJECUTABLE AQUÍ.

### A5 — Android
Release firmado preparado en `.github/workflows/build-release.yml`.
Secretos requeridos:
- `CAMELLO_RELEASE_KEYSTORE_B64`
- `CAMELLO_KEYSTORE_PASSWORD`
- `CAMELLO_KEY_ALIAS`
- `CAMELLO_KEY_PASSWORD`
No se guardan en el repo.
Estado: PENDIENTE DE SECRETO Y EJECUCIÓN DEL RELEASE.

### A6 — Documentación
Actualizados: README, ARQUITECTURA, DATOS, DECISIONES, PRUEBAS, RELEASE, PROGRESO y CHANGELOG.

### A7 — entrega
El informe final incluye hashes, estado CI/APK, Intacto verificado, Pendiente de decidir y guía manual.

## Compuerta final

HEAD verificado de la rama al cierre de este turno: `2f3228ed047b1ae5736b483fbf9fed3d86c74d4d`.

- Verify: QUEUED en GitHub Actions (runs 344 y 345).
- UI smoke: QUEUED (runs 228 y 229).
- E2E: QUEUED (runs 50 y 51).
- APK debug: QUEUED (runs 351 y 352).
- Etiquetado de fases: SKIPPED porque no existe un commit con marcador `[phase-ok:...]` posterior a F0.
- Release firmado: PENDIENTE DE SECRETOS de GitHub.
- Instrumented Android: NO EJECUTABLE AQUÍ.

Tags reales al cierre: `fase-0-ok` existe; `fase-c1-ok` a `fase-c9-ok` no existen porque no se obtuvo una compuerta verde final para esas fases.

No se ha tocado `main` ni se ha hecho merge.
