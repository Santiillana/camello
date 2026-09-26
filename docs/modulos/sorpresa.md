# Módulo Sorpresa — especificación interna

## Idea
Una pequeña experiencia offline para el ecosistema de mascotas: propone un reto de bienestar/convivencia diario y permite registrar si se realizó, con una nota opcional.

## Por qué
Es independiente del flujo comercial, no necesita internet ni permisos nuevos y puede ser útil para dueños de mascotas sin alterar ventas, cartera, rutas o métricas del negocio.

## Datos
La única tabla del módulo es `mod_sorpresa_habitos`. El núcleo no consulta sus filas y sus registros no entran en métricas comerciales.

## Uso
1. Abrir “Sorpresa”.
2. Leer el reto del día.
3. Escribir una nota opcional.
4. Pulsar “Lo hice hoy”.
5. Revisar el registro del día.

## Aislamiento
Todo vive bajo `src/modulos/sorpresa/`. La UI recibe únicamente `ContextoModulo`.
No usa red, HTML dinámico, permisos ni dependencias adicionales.

## Retirada
Desactivar desde Configuración > Módulos. Para eliminar sus datos, usar “Borrar datos”. Para quitarlo del producto, borrar la carpeta del módulo.
