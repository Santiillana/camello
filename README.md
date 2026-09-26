# CAMELLO

**CAMELLO** es la aplicación de control operativo y financiero de **COMBOPITT**, creada para llevar el negocio desde el teléfono de forma práctica, rápida y confiable.

Su propósito no es convertir el negocio en un ERP ni exigir conocimientos contables. CAMELLO reúne en un solo lugar la información que realmente se necesita para trabajar: clientes, mascotas, productos, ventas, cobros, cartera, gastos, pedidos, rutas, ubicación e informes.

La aplicación está pensada para funcionar de forma local y con el menor trabajo manual posible. El usuario registra los movimientos del negocio y CAMELLO se encarga de relacionarlos, calcular totales y mostrar el estado financiero.

## Qué resuelve

CAMELLO permite mantener una visión clara del negocio sin repartir la información entre cuadernos, hojas de cálculo y aplicaciones distintas.

El núcleo de trabajo incluye:

- **Clientes y mascotas:** registro, edición, historial, teléfonos, ubicación, seguimiento y fotos.
- **Productos:** nombre, precio de venta y **costo unitario**. El costo se guarda como referencia histórica de cada venta.
- **Ventas:** ventas de uno o varios productos, efectivo, transferencia/Nequi, fiado y pagos parciales.
- **Pagos y cartera:** cobros posteriores, saldos pendientes e historial por cliente.
- **Pedidos:** pedidos pendientes, fecha de entrega y preparación para rutas.
- **Rutas:** rutas operativas y rutas de entrega con control de paradas y cuadre.
- **Mapa:** clientes geolocalizados, filtros, selección de clientes, rutas y orden de paradas.
- **Gastos del negocio:** categorías, fijo/variable, pagado/pendiente y naturaleza del gasto.
- **Gastos personales:** módulo opcional y separado de las finanzas empresariales.
- **Informes:** día, semana, mes y rango personalizado con ventas, cobros, costos, gastos, utilidad y cartera.
- **Respaldo y restauración:** copias verificables de la base y datos de módulos.
- **Exportación de clientes:** JSON completo y CSV para herramientas de oficina.

## Filosofía financiera

CAMELLO mantiene el modelo financiero deliberadamente sencillo.

Cada producto tiene un **costo unitario** definido por el usuario y un precio de venta. En una venta, ambos valores se guardan como referencia histórica para que cambiar el precio o costo del producto en el futuro no altere las ventas antiguas.

La lectura financiera combina:

`ventas + costos unitarios de los productos vendidos + gastos del negocio + pagos + cartera`

Con esto se pueden consultar, según el período:

- ventas y número de ventas;
- unidades vendidas;
- ingresos;
- dinero cobrado;
- dinero pendiente;
- costos de productos;
- gastos operativos;
- utilidad;
- flujo de caja;
- cuentas por cobrar.

Los **gastos personales** y los **retiros del dueño** se mantienen diferenciados de los gastos operativos del negocio.

## Funcionamiento local y offline-first

Los datos principales permanecen en SQLite local.

En Android, CAMELLO utiliza SQLite mediante `@capacitor-community/sqlite`. Para el entorno web y las pruebas automatizadas se utiliza SQLite con persistencia basada en IndexedDB.

El diseño busca que la operación cotidiana no dependa de un servidor central para los datos del negocio.

## Seguridad e integridad

CAMELLO incorpora controles orientados a evitar errores de operación y pérdida de información:

- operaciones con identificadores únicos para prevenir duplicados;
- borradores persistentes para formularios interrumpidos;
- snapshots históricos de precio y costo en ventas;
- validaciones de base de datos y migraciones;
- checksum SHA-256 para respaldos;
- respaldo cifrado mediante AES-GCM/PBKDF2;
- posibilidad de guardar el respaldo en una carpeta externa de Android;
- la base de datos local de SQLite no usa cifrado nativo; la protección de copias se realiza mediante respaldo externo y, cuando se necesita, respaldo cifrado;
- PIN local opcional;
- controles de integridad y auditoría de anulaciones.

La aplicación no debe guardar secretos ni keystores de release dentro del repositorio.

## Respaldo y restauración

El respaldo completo conserva la base de datos y los datos de los módulos compatibles.

El usuario puede:

- descargar un respaldo;
- generar un respaldo cifrado;
- compartirlo;
- guardarlo en una carpeta elegida en Android;
- restaurarlo después de validarlo.

La intención es que una copia guardada fuera del almacenamiento privado de CAMELLO sobreviva a una desinstalación y permita recuperar la información en una instalación posterior.

## Exportación completa de clientes

La función **Exportar clientes** está pensada como una salida independiente de los datos del negocio.

### JSON completo

El archivo JSON conserva la información relacionada con los clientes y sus relaciones, incluyendo, según las entidades existentes:

- clientes;
- mascotas;
- fotos;
- seguimiento;
- ventas;
- pagos;
- pedidos;
- artículos de pedidos;
- rutas referenciadas.

El JSON es el formato principal para conservar la información con fidelidad y facilitar futuras migraciones.

### CSV para herramientas de oficina

También existe una exportación CSV UTF-8 de la tabla de clientes para trabajar fácilmente con:

- Microsoft Excel;
- Google Sheets;
- LibreOffice;
- otras herramientas que acepten CSV.

El CSV es un formato de intercambio práctico; el JSON es la copia maestra cuando se necesita conservar la estructura completa.

## Arquitectura

El proyecto utiliza:

- **React**
- **TypeScript**
- **Vite**
- **Capacitor**
- **Android**
- **SQLite**
- **sql.js / IndexedDB** para pruebas y entorno web
- **Leaflet + OpenStreetMap** para mapas
- **GitHub Actions** para validación y compilación

La base de datos mantiene migraciones versionadas y validaciones de integridad para facilitar actualizaciones sin perder información.

## Estructura del repositorio

```text
src/
├── components/   componentes y asistentes reutilizables
├── db/           esquema, acceso a SQLite y migraciones
├── pages/        pantallas principales
├── utils/        respaldo, seguridad, ubicación, tema y utilidades
└── modulos/      módulos desacoplados

android/           proyecto Android de Capacitor
scripts/           verify, E2E, UI Smoke y benchmarks
docs/              arquitectura, pruebas, release y decisiones
.github/workflows/ automatizaciones de CI/CD
```

## Desarrollo

Requisitos principales: Node.js compatible con la versión definida por el proyecto y el entorno Android/Capacitor para compilar la aplicación nativa.

Instalar dependencias:

```bash
npm ci
```

Desarrollo web:

```bash
npm run dev
```

Build web:

```bash
npm run build
```

Validación completa:

```bash
npm run verify
```

Benchmarks:

```bash
npm run benchmark:db
npm run benchmark:scale
```

Sincronización de Android:

```bash
npx cap sync android
```

Compilación local del APK debug:

```bash
cd android
./gradlew assembleDebug
```

## Calidad y CI

GitHub Actions valida, según el workflow correspondiente:

- TypeScript;
- lint;
- pruebas automatizadas;
- base de datos y migraciones;
- módulos;
- seguridad;
- ubicación;
- benchmarks;
- UI Smoke;
- E2E;
- sincronización y compilación Android;
- generación y validación del APK debug.

La versión que se considera verificable debe corresponder al mismo commit que genera el APK.

## Alcance deliberado

CAMELLO está diseñado para el control diario del negocio, no para sustituir un ERP o un sistema contable especializado.

No forma parte del alcance base:

- contabilidad fiscal avanzada;
- nómina;
- impuestos;
- facturación electrónica;
- inventario avanzado de materias primas;
- costeo industrial por lotes;
- sincronización multi-dispositivo mediante servidor;
- GPS permanente en segundo plano;
- comercio electrónico.

Estas exclusiones son intencionales. La prioridad es que lo que CAMELLO hace, lo haga bien, con poca complejidad y sin perder información.

## Estado del proyecto

La rama `release/v1` es la fuente de trabajo para el cierre de la versión 1.0.0.

Antes de considerar una versión lista para uso, deben pasar las validaciones automatizadas y debe comprobarse que el APK corresponde exactamente al HEAD verificado.
