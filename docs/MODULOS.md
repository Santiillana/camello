# Módulos CAMELLO

## Contrato
Cada módulo vive dentro de `src/modulos/<id>/` y publica el contrato de `src/modulos/contrato.ts`:
`id`, `nombre`, `version`, `apiMinima`, `icono`, `ruta`, `Componente`, `migraciones[]`, `exportar()`, `importar()`, `limpiar()`.

El núcleo descubre módulos con `import.meta.glob('./*/index.ts')`. Quitar una carpeta elimina ese módulo sin tocar el router ni el menú del núcleo.

## Aislamiento
El módulo solo escribe tablas con prefijo `mod_<id>_`. El contexto de escritura rechaza SQL que intente tocar tablas del núcleo. La lectura del núcleo se limita a operaciones tipadas expuestas por `crearContextoModulo()`.

Las migraciones de módulo se registran en `modulos_migraciones`.

## Activación
Configuración > Módulos permite activar/desactivar cada módulo. Desactivar no borra datos.

El botón separado de “Borrar datos” exige confirmación y elimina únicamente las tablas del prefijo del módulo.

## Fallos
Cada módulo usa un Error Boundary propio. Un error desactiva el módulo y no tumba el núcleo.

## Respaldo
Los datos de módulos viajan dentro de `modulos.<id>`. Un respaldo puede restaurarse aunque el módulo no esté instalado; el núcleo conserva su propia información.

## Crear un módulo
1. Crear `src/modulos/<id>/index.ts`.
2. Crear el componente en la misma carpeta.
3. Usar únicamente `ContextoModulo`.
4. Crear solo tablas `mod_<id>_*`.
5. Añadir migraciones idempotentes con snapshot.
6. Implementar exportar/importar/limpiar.
7. Añadir pruebas en `scripts/verify-modulos.mjs` o pruebas propias.
8. Comprobar que funciona con y sin la carpeta del módulo.

## Reemplazar
Borra la carpeta antigua y crea otra con el mismo contrato. El núcleo no cambia.
