# INSTRUCCIÓN MAESTRA DEFINITIVA PARA CERRAR CAMELLO

## Objetivo

Trabajar sobre `release/v1` como fuente de verdad y dejar CAMELLO listo para generar el APK DEBUG final.

CAMELLO ya existe y tiene una arquitectura y funcionalidades construidas. **No se debe reconstruir ni rediseñar radicalmente.** El trabajo consiste en entender lo existente, corregir errores, limpiar lo necesario, completar lo que falte y añadir solo las mejoras acordadas.

El criterio de éxito es:

**todo lo que CAMELLO ya hace debe funcionar correctamente, sin errores conocidos, sin pérdida de datos y sin duplicaciones, con una operación sencilla y eficaz.**

## Regla principal: no sobreingeniería

No crear complejidad por el simple hecho de que sea técnicamente posible.

Antes de añadir una capa, módulo, estructura o cálculo nuevo, comprobar si realmente es necesaria.

La solución preferida es la más sencilla que sea:

- segura;
- confiable;
- mantenible;
- suficiente para el negocio.

CAMELLO debe ser completo en información y sencillo en operación. No debe convertirse en un ERP.

## Auditoría antes de modificar

Revisar primero:

- arquitectura;
- tecnologías;
- estructura;
- navegación;
- base de datos;
- migraciones;
- persistencia;
- ventas;
- clientes;
- mascotas;
- productos;
- pagos;
- cartera;
- gastos;
- gastos personales;
- pedidos;
- rutas;
- mapa;
- informes;
- backup/restore;
- exportación de clientes;
- configuración;
- pruebas;
- GitHub Actions;
- generación del APK.

Clasificar lo encontrado como funcionando, parcial, roto, incompleto, innecesariamente complejo o susceptible de pérdida/duplicación de datos.

## No regresión

Conservar todo lo que ya funcione.

Prioridad de trabajo:

**corregir → estabilizar → limpiar → mejorar → añadir lo estrictamente necesario.**

No sustituir arquitectura ni tecnologías únicamente por preferencia.

## Operación diaria

Minimizar la información que debe introducir el usuario.

Cuando un dato pueda calcularse o relacionarse automáticamente con información ya registrada, no pedirlo de nuevo.

CAMELLO debe encargarse de cálculos, totales, estados, relaciones, saldos e informes.

## Productos

Mantener un modelo deliberadamente sencillo.

Cada producto solo necesita:

- nombre;
- precio de venta;
- costo unitario;
- estado básico.

El **costo unitario** lo define el usuario.

Utilizar ese costo unitario como referencia histórica de cada venta.

No crear:

- recetas;
- costeo por lote;
- materias primas detalladas;
- inventario industrial;
- MRP;
- fórmulas de fabricación;
- costeo avanzado.

El control financiero debe relacionar:

**ventas + costo unitario de los productos vendidos + gastos del negocio + pagos + cartera.**

## Finanzas del negocio

Mostrar por día, semana, mes y rango:

- ventas;
- número de ventas;
- unidades vendidas;
- ingresos;
- dinero cobrado;
- dinero pendiente;
- costos de productos;
- gastos operativos;
- utilidad;
- flujo de caja;
- cuentas por cobrar.

Diferenciar:

**costo del producto**

de

**gasto operativo**

y de

**gasto personal**.

Una venta con varios productos sigue siendo una sola venta y debe contabilizar sus unidades correctamente.

No complicar la contabilidad más allá del control real que necesita el negocio.

## Gastos

Permitir:

- categoría;
- valor;
- fecha;
- descripción;
- fijo/variable;
- pagado/pendiente.

Los estados deben ser seleccionables y persistentes:

- Ya pagué;
- Por pagar.

Las categorías deben usar selectores cuando existan valores predefinidos.

Diferenciar:

- operativo;
- compra de insumos;
- retiro del dueño.

Una compra de insumos no debe descontarse dos veces de la utilidad si el costo unitario aplicado al producto ya incorpora ese costo. Sí debe poder reflejarse como salida real de dinero en el flujo de caja.

## Gastos personales

Son opcionales y están separados del negocio.

Nunca deben contaminar:

- ventas;
- costos;
- gastos operativos;
- utilidad;
- cartera;
- flujo de caja empresarial.

Los retiros del dueño deben mantenerse diferenciados de los gastos operativos.

## Ventas y tickets

El flujo debe ser:

**borrador → confirmación → venta definitiva → ticket → pago → cartera/informes.**

Toda operación confirmable debe ser idempotente.

No permitir:

- ventas duplicadas;
- tickets duplicados;
- pagos duplicados;
- formularios pendientes que reaparezcan después de una confirmación;
- duplicación por doble toque o reapertura.

Los datos deben persistir correctamente al navegar, cerrar y reabrir la aplicación.

## Clientes y mascotas

Conservar íntegramente la información y relaciones entre clientes, mascotas, teléfonos, ubicación, ventas, pagos, pedidos y cartera.

No perder datos por cancelar o abandonar formularios.

## Pedidos y rutas

Mantener el flujo:

**pedido → selección → ruta de entrega → orden de paradas → entrega → cobro o fiado.**

Una entrega no debe generar ventas o pagos duplicados.

## Mapa

Corregir la carga de calles, tamaño, errores de render, ubicación y persistencia de coordenadas.

Mantener filtros por:

- cliente;
- múltiples clientes;
- ruta;
- ruta de entrega;
- pedidos;
- deuda;
- días sin compra;
- otros filtros existentes útiles.

Mostrar el orden de las paradas y, cuando sea viable, una polilínea.

No convertir CAMELLO en un navegador GPS giro a giro.

## Interfaz

Conservar la identidad visual actual.

Corregir:

- desbordamientos;
- textos sobrepuestos;
- elementos fuera de tarjetas;
- botones pequeños;
- formularios incómodos;
- problemas de espaciado;
- contenido cortado.

Validar 360 px, 390 px y 430 px.

Eliminar la navegación horizontal inferior duplicada.

Mantener una sola navegación lateral y el botón flotante de acciones rápidas.

No rediseñar toda la aplicación.

## Backup y restore

El respaldo completo debe ser verificable y guardable en una ubicación externa al almacenamiento privado de CAMELLO.

Debe sobrevivir a desinstalar y reinstalar la aplicación.

Validar:

- versión;
- integridad;
- checksum;
- estructura;
- compatibilidad;
- restauración segura.

No permitir una limpieza destructiva sin un respaldo verificado cuando corresponda.

## Exportación completa de clientes

Debe existir **Exportar clientes** como función independiente.

La exportación completa debe utilizar **JSON UTF-8** como formato maestro.

Debe conservar la información y relaciones relevantes de:

- clientes;
- mascotas;
- fotos;
- seguimiento;
- ventas;
- pagos;
- pedidos;
- artículos de pedidos;
- rutas referenciadas.

El JSON debe conservar IDs, valores nulos, fechas, campos opcionales y relaciones.

Además puede existir una exportación **CSV UTF-8** para la tabla de clientes, orientada a Excel, Google Sheets y LibreOffice.

El JSON es la copia maestra cuando el objetivo sea conservar la información completa.

La exportación no puede modificar ni borrar datos.

## Seguridad

Revisar:

- secretos;
- credenciales;
- permisos;
- almacenamiento;
- logs;
- datos personales;
- dependencias;
- backups.

No colocar secretos ni keystores de release en Git.

No registrar información personal innecesariamente.

Mantener validaciones, consultas parametrizadas y controles de integridad.

## Limpieza

Eliminar, cuando realmente estén sin uso:

- imports;
- estados;
- componentes;
- handlers;
- código muerto;
- logs temporales;
- CSS contradictorio;
- soluciones temporales;
- capturas y artefactos de prueba.

No limpiar por estética si existe riesgo de regresión.

## README

Actualizar `README.md` para que describa el proyecto real.

Debe explicar:

- qué es CAMELLO;
- para qué sirve;
- funcionalidades;
- filosofía de uso;
- modelo financiero sencillo;
- costo unitario de productos;
- backup/restore;
- exportación de clientes;
- arquitectura;
- desarrollo;
- pruebas;
- APK;
- alcance y límites.

No inventar capacidades.

## Pruebas

Ejecutar y dejar en verde las validaciones disponibles:

- `npm ci`;
- `npm run build`;
- `npm run verify`;
- verify DB;
- módulos;
- seguridad;
- ubicación;
- benchmarks;
- UI Smoke;
- E2E;
- compilación Android;
- validación del APK.

El E2E debe cubrir especialmente clientes, borradores tras recarga, ventas, doble confirmación, anulación, pagos, cartera, gastos, pedidos, rutas, entregas, mapa, respaldo y exportación de clientes.

## APK DEBUG final

Generar el APK únicamente desde el mismo commit que haya pasado la batería de validaciones.

Verificar:

- commit SHA;
- workflow;
- ejecución;
- versión;
- tamaño;
- SHA-256;
- validez del paquete Android;
- correspondencia exacta entre APK y HEAD.

La release firmada queda separada y requiere los secretos reales del propietario.

## Criterio de cierre

CAMELLO está listo cuando:

- sus funciones existentes funcionan;
- los errores reportados están corregidos;
- no existen duplicaciones conocidas;
- no se pierde información;
- los cálculos financieros son coherentes;
- backup y restore funcionan;
- exportación de clientes funciona;
- interfaz es usable en teléfonos;
- mapa, pedidos y rutas funcionan;
- README está actualizado;
- CI está en verde;
- el APK DEBUG corresponde exactamente al HEAD validado.

**No terminar agregando más cosas. Terminar haciendo que lo que ya existe funcione muy bien.**
