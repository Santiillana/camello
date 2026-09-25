# CAMELLO v1 · Instrucción maestra para cierre y APK final

## Objetivo

Trabajar sobre `release/v1` como fuente de verdad y entregar una versión final de CAMELLO que conserve todas las funciones ya existentes y corrija los problemas observados en pruebas reales.

No se deben eliminar funcionalidades existentes por simplificar. Tampoco se deben introducir funcionalidades especulativas. Cada cambio debe responder a un requisito de esta instrucción, a un bug reproducible o a una necesidad técnica comprobable.

## Interfaz y experiencia móvil

Mantener la estética moderna, tarjetas, colores, personalización, configuración inicial, accesos rápidos y botón flotante “+”.

Eliminar la navegación horizontal inferior. La navegación principal debe vivir en el riel lateral vertical. No duplicar Clientes, Rutas, Cartera, Gastos, Informes ni las demás secciones en una barra inferior.

Revisar todas las pantallas para:
- evitar texto superpuesto;
- impedir desbordamientos fuera de tarjetas;
- permitir textos largos sin romper el diseño;
- adaptar botones, inputs, selects y áreas de texto al ancho disponible;
- usar una sola columna en pantallas pequeñas cuando dos columnas resulten incómodas;
- respetar áreas seguras y viewport dinámico del teléfono;
- mantener controles táctiles utilizables;
- comprobar al menos 360 px, 390 px y 430 px de ancho.

## Ventas, formularios y tickets

Toda operación confirmable debe ser idempotente. Un doble toque, reintento o reapertura de pantalla no puede crear una segunda venta.

El flujo de borrador debe ser:
Borrador → Confirmación → Registro definitivo → Ticket → Limpieza del borrador.

Después de una operación confirmada, el borrador correspondiente debe eliminarse de forma fiable. Un ticket cerrado no puede reaparecer como formulario pendiente.

Las operaciones deben tener identificadores idempotentes estables durante el intento de guardado. La base debe mantener restricciones únicas donde corresponda.

## Gastos empresariales

El estado del pago debe ser obligatorio y claramente seleccionable:
- Ya pagué.
- Por pagar.

Las categorías deben utilizar selectores claros:
- Fijo / Variable.
- Operativo / Compra de insumos / Retiro del dueño.

Una compra de materia prima no debe restarse dos veces de la utilidad si el costo aplicado al producto vendido ya incorpora ese costo. Las compras deben mostrarse también como movimiento de caja para que el usuario pueda conciliar dinero real.

## Gastos personales

Los gastos personales son un módulo independiente y opcional.

Nunca deben contaminar:
- ventas;
- costos de producto;
- gastos operativos empresariales;
- utilidad;
- cartera;
- flujo de caja empresarial.

Debe existir activación/desactivación desde Configuración. Sus categorías tienen Fijo/Variable y sus registros deben permanecer separados incluso después de respaldos y restauraciones.

## Pedidos y rutas de entrega

Debe existir un flujo simple:

Pedidos recibidos → selección de pedidos → ruta de entrega → orden de paradas → entrega → cobro o fiado → cierre.

Una ruta de entrega permite seleccionar pedidos pendientes sin ruta.

Cada parada debe mostrar cliente, productos, cantidades, total y estado.

La entrega crea las ventas correspondientes una sola vez mediante identificadores idempotentes y registra el método de pago.

Una ruta no puede cerrarse mientras tenga pedidos pendientes de resolver ni mientras el cuadre de inventario sea distinto de cero.

## Mapa

El mapa debe cargar las calles de OpenStreetMap mediante HTTPS, redimensionarse correctamente y mostrar estados claros de carga/error.

Los marcadores, clientes y filtros locales no deben desaparecer porque las teselas de calles fallen.

Los filtros deben permitir:
- todos los clientes;
- búsqueda;
- una ruta específica;
- clientes seleccionados manualmente;
- deuda;
- días sin compra;
- recompra vencida.

Para rutas de entrega debe mostrarse el orden de las paradas.

La polilínea interna representa el orden de las paradas, no navegación giro a giro. La navegación externa puede abrir un servicio de mapas cuando sea necesaria.

Las coordenadas deben validarse y la ubicación actual debe usar alta precisión cuando el dispositivo la permita.

## Informes financieros

Los informes deben ofrecer hoy, semana, mes y rango personalizado.

Como mínimo deben mostrar:
- ventas;
- número de ventas;
- clientes atendidos;
- productos y unidades;
- costo de producto/materia prima;
- utilidad bruta;
- gastos operativos;
- utilidad neta;
- cobrado;
- pendiente;
- cartera;
- flujo de caja;
- compras de insumos;
- gastos fijos;
- gastos pendientes;
- retiros del dueño.

El detalle por producto debe mostrar cantidad, ventas, utilidad y clientes.

Las cifras deben proceder de movimientos reales de SQLite y conservar coherencia con ventas, pagos y gastos.

## Respaldo y restauración

El respaldo debe ser completo y verificable con checksum.

Debe existir:
- exportación normal;
- exportación cifrada;
- guardado en una carpeta elegida por el usuario;
- restauración;
- validación antes de modificar la base;
- respaldo de seguridad previo a restaurar cuando la plataforma lo permita;
- limpieza de aplicación condicionada a respaldo verificado.

La copia guardada mediante el selector de carpeta Android debe quedar fuera del almacenamiento privado de CAMELLO y sobrevivir a la desinstalación.

Probar restauración con datos de prueba y comprobar clientes, productos, ventas, pagos, gastos, pedidos, rutas y datos de módulos.

## Seguridad e integridad

Mantener TypeScript estricto, consultas parametrizadas y validación de entradas.

No guardar secretos, keystores, contraseñas, tokens ni credenciales en Git.

Conservar las protecciones de base, unicidad de operaciones, auditoría de anulaciones y validación de backups.

No ocultar errores reales detrás de catches silenciosos cuando una operación de datos pueda haber quedado incompleta. Los fallos auxiliares opcionales sí pueden ser best-effort cuando no comprometan integridad.

## Código limpio

Eliminar:
- imports sin uso;
- estados sin uso;
- código muerto;
- handlers duplicados;
- estilos contradictorios;
- soluciones temporales;
- sintaxis accidentalmente escapada;
- comentarios obvios que no aporten contexto.

No dejar archivos de depuración, capturas, credenciales ni artefactos temporales en el repositorio.

## Pruebas obligatorias

Ejecutar y dejar en verde:
- `npm ci`
- `npm run build`
- `npm run verify`
- verify-db
- verify-modulos
- verify-security
- verify-ubicacion
- benchmarks
- UI Smoke
- E2E

El E2E debe cubrir configuración inicial, borradores tras recarga, clientes, ventas, doble confirmación, anulación, pagos, cartera, gasto pagado, gasto pendiente, pedido, ruta de entrega, entrega cobrada, cierre/cuadre, mapa, respaldo y ausencia de errores de consola.

## APK

El APK solo debe generarse desde el HEAD exacto que haya pasado toda la batería.

El workflow debe publicar:
- APK debug;
- SHA-256 del APK;
- versión;
- commit/HEAD verificable.

Verificar además que el APK sea un paquete Android válido y que su contenido ZIP no tenga errores.

La versión debug se usa para pruebas físicas. La release firmada requiere el keystore real del propietario y los secretos correspondientes. El keystore nunca entra a Git.

## Criterio de cierre

Esta iteración se considera cerrada cuando:
1. el código está limpio;
2. el CI está verde;
3. los flujos críticos tienen cobertura E2E;
4. el APK corresponde exactamente al HEAD verificado;
5. no existen errores conocidos de los requisitos definidos aquí.

La protección administrativa de `main`, tags oficiales y firma release se gestionan por separado cuando requieren permisos o secretos del propietario.
