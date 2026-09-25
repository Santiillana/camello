# PROGRESO CAMELLO v1.0.0

Rama: `release/v1`
Base funcional: `fix/sqlite-wasm-web`
PR #5 / `fix/jeep-sqlite-wasm`: fuera de alcance, no se modifica.

HEAD de trabajo verificado al actualizar este documento: `208f64b0bea43e980186cd3ac35d9155ba3f7ca8`.

## Estado por bloques

- TypeScript estricto: configurado en ambos tsconfig.
- SQLite/migraciones: endurecido con transacciones individuales, rollback y verificación automatizada.
- ErrorBoundary raíz: implementado y con prueba de error deliberado en Vitest.
- Leaflet: icono local en `UbicacionMiniMapa`; `Mapa.tsx` usa `circleMarker`.
- Vitest y E2E: integrados en `npm run verify`.
- CI: los workflows contienen pasos reales y `release/v1` ejecuta Verify/E2E/APK por push.
- Supply chain: `npm audit --audit-level=high` queda como paso explícito de CI.
- Documentación: reconciliada con las limitaciones reales de la infraestructura.

## Evidencia todavía requerida

Los criterios que necesitan recursos externos no se marcan como cumplidos sin evidencia real:

- ejecución completa de `npm ci && npm run verify` en una máquina local del dueño;
- instalación y prueba funcional del APK en un teléfono físico;
- prueba visual de 1000 clientes en teléfono;
- generación y verificación de APK release firmado;
- custodia del keystore en dos ubicaciones fuera de Git;
- protección administrativa de `main`.

La evidencia disponible en GitHub Actions y el resultado del PR se usarán para cerrar todo lo que sí pueda demostrarse de forma reproducible.

## Regla de honestidad

No se considera PASÓ ningún criterio solo porque el código parezca correcto o porque una ejecución anterior haya sido verde. Cada afirmación final debe corresponder a una ejecución, artefacto o configuración verificable del estado final de `release/v1`.
