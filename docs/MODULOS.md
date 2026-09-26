# MODULOS.md

Los módulos son descubiertos con import.meta.glob('./*/index.ts'). El contrato está en src/modulos/contrato.ts.

## Quitar
Borra una carpeta de src/modulos/<id>/. El núcleo puede continuar sin ella; CI compila con el módulo sorpresa ausente.

## Desactivar
Configuración → Módulos → Desactivado. Los datos permanecen.

## Borrar datos
Configuración → Módulos → Borrar datos. La acción exige confirmación y solo toca tablas con prefijo mod_<id>_.

## Reemplazar
Sustituye una carpeta por otra que implemente el mismo contrato.

## Crear
1. Crear src/modulos/<id>/index.ts.
2. Implementar ModuloContrato.
3. Crear el componente lazy.
4. Añadir migraciones propias con contexto.migracion().
5. Usar solo contexto.leer() y tablas prefijadas.
6. Añadir exportar/importar/limpiar y pruebas verify:modulos.