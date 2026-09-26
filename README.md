# CAMELLO

**CAMELLO** es una aplicación local, offline-first y orientada a móvil para la gestión operativa y financiera de **COMBOPITT**.

Su objetivo es concentrar en un solo lugar clientes, mascotas, productos, ventas, pagos, cartera, pedidos, rutas, ubicación, gastos, gastos personales e informes.

La prioridad del proyecto es simple: **integridad de datos, operación sin servidor y recuperación confiable de la información**.

## 1. Qué hace

- **Clientes y mascotas:** registro, teléfonos, observaciones, ubicación, fotos, seguimiento y recordatorios.
- **Productos y ventas:** precio y costo unitario, ventas de contado, transferencia/Nequi, fiado y pagos parciales.
- **Cartera:** saldos pendientes, cobros e historial por cliente.
- **Pedidos y rutas:** preparación, fechas de entrega, asignación, cuadre y control de paquetes.
- **Mapa:** clientes geolocalizados, filtros y orden de paradas.
- **Finanzas:** gastos del negocio, gastos personales separados, utilidad, flujo de caja e informes.
- **Respaldos:** formato portable versionado, respaldo clásico, respaldo cifrado y exportación de clientes.

## 2. Arquitectura

CAMELLO es una aplicación **local-first**.

### Stack

- React 19
- TypeScript
- Vite
- Capacitor 8
- Android
- SQLite con @capacitor-community/sqlite
- sql.js + IndexedDB para web y pruebas
- Leaflet + OpenStreetMap
- Vitest
- Playwright
- GitHub Actions

### Persistencia

La base principal es SQLite local. En Android se utiliza SQLite nativo mediante Capacitor. En web se utiliza sql.js con persistencia basada en IndexedDB.

La operación cotidiana no depende de un servidor central.

## 3. Estructura del repositorio

~~~text
src/
├── components/        componentes reutilizables
├── db/                SQLite, esquema, migraciones y acceso a datos
├── modulos/           módulos desacoplados
├── pages/             pantallas principales
├── utils/             respaldo, seguridad, ubicación y utilidades
└── types/             tipos del dominio

android/               proyecto Android de Capacitor
scripts/               verify, E2E, UI Smoke y benchmarks
tests/                 pruebas automatizadas
.github/workflows/     CI y automatizaciones
~~~

## 4. Base de datos

El esquema está definido en `src/db/schema.ts` y la versión actual es **16**.

Las migraciones históricas están implementadas en `src/db/database.ts`.

Durante el arranque CAMELLO valida, entre otras cosas:

- foreign keys;
- foreign_key_check;
- integrity_check;
- existencia de tablas obligatorias;
- ausencia de artefactos temporales de migración;
- compatibilidad de la versión de esquema.

Las operaciones importantes se realizan dentro de transacciones cuando necesitan atomicidad.

## 5. Respaldo: formato oficial

El respaldo es parte del diseño central del proyecto. La regla de operación es:

> **Antes de actualizar, desinstalar, reinstalar o cambiar de dispositivo, generar y conservar un respaldo portable fuera del almacenamiento privado de CAMELLO.**

### 5.1 CAMELLO Portable Backup

El formato maestro para transportar datos entre instalaciones es:

~~~text
CAMELLO_PORTABLE_BACKUP
format_version: 1
~~~

Es un único JSON autocontenido y versionado. El archivo puede guardarse en cualquier almacenamiento externo y no depende de un archivo SQLite binario concreto.

Estructura lógica del paquete:

~~~text
manifest
├── format
├── format_version
├── app_version
├── database
├── schema_version
├── exported_at
└── table_count

files
├── database.tables
└── modules

checksums
├── database
├── modules
└── package
~~~

La aplicación lo genera desde `src/utils/respaldoPortable.ts` y desde la lógica de respaldo de `src/db/database.ts`.

### 5.2 Qué contiene

La sección `database.tables` contiene las tablas y sus filas en un formato estructurado:

~~~json
{
  "name": "clientes",
  "columns": ["id", "nombre"],
  "rows": [[1, "Cliente ejemplo"]]
}
~~~

Esto hace que el archivo sea utilizable como fuente de migración aunque en el futuro cambie la representación interna de SQLite.

También se conserva el estado exportable de los módulos.

### 5.3 Integridad

El paquete usa SHA-256 para comprobar:

- los datos de la base;
- los datos de módulos;
- el paquete completo.

Un cambio posterior en el archivo provoca el rechazo durante la validación.

### 5.4 Compatibilidad entre versiones

Reglas del formato:

- una versión nueva puede restaurar un esquema anterior conocido;
- una versión antigua no debe restaurar automáticamente un esquema futuro que no conoce;
- el formato tiene su propia versión independiente de la versión de la base;
- las tablas que ya no existan en una versión nueva pueden quedar como no mapeadas, sin destruir el archivo original.

La base SQLite es la representación operativa de CAMELLO. El Portable Backup es la representación de conservación y transporte.

### 5.5 Restauración

La restauración sigue esta cadena:

~~~text
archivo
  ↓
validar JSON
  ↓
validar manifest
  ↓
verificar SHA-256
  ↓
comprobar versión de esquema
  ↓
preparar esquema actual
  ↓
reemplazar datos dentro de una transacción
  ↓
reactivar foreign keys
  ↓
foreign_key_check + integrity_check
  ↓
persistir
~~~

Si falla la operación principal, la transacción se revierte.

### 5.6 Organización recomendada en almacenamiento externo

La aplicación Android puede guardar el archivo portable en una carpeta externa elegida por el usuario.

La organización recomendada es:

~~~text
CAMELLO-RESPALDOS/
├── camello-portable-respaldo-v1-AAAA-MM-DDTHH-MM-SS.json
├── camello-portable-respaldo-v1-AAAA-MM-DDTHH-MM-SS.json
└── ...
~~~

El sistema no depende de los nombres de la carpeta para restaurar: cada archivo portable contiene su propio manifest y sus propios checksums.

### 5.7 Respaldo clásico

El proyecto mantiene además el formato SQLite de respaldo existente para compatibilidad con instalaciones anteriores y recuperación operativa.

Para una actualización o reinstalación, el formato recomendado es **Portable Backup**.

## 6. Estrategia de actualización

~~~text
1. Abrir la versión actual.
2. Generar el respaldo portable.
3. Guardarlo fuera de CAMELLO.
4. Actualizar, desinstalar o reinstalar.
5. Instalar la nueva versión.
6. Restaurar el respaldo portable.
7. Comprobar clientes, ventas, cartera y gastos.
~~~

El objetivo es que la aplicación pueda cambiar sin convertir la base anterior en un punto único de fallo.

## 7. Respaldo cifrado

También existe respaldo cifrado. El respaldo portable puede envolverse con el mecanismo de cifrado de CAMELLO.

La contraseña es indispensable para recuperar el contenido cifrado y debe conservarse fuera del dispositivo.

Los respaldos sin cifrar contienen información personal y deben tratarse como información sensible.

## 8. Exportación de clientes

Existe una exportación independiente de clientes.

### JSON

Conserva clientes, mascotas, fotos, seguimiento, ventas, pagos, pedidos, artículos de pedidos y rutas referenciadas.

### CSV

Existe CSV UTF-8 para Excel, Google Sheets, LibreOffice y herramientas similares.

El CSV sirve para intercambio tabular. El Portable Backup es la copia maestra para recuperación completa.

## 9. Módulos

Los módulos de `src/modulos/` utilizan una API controlada y definen identidad, versión, migraciones, exportación, importación, limpieza y componente visual.

El runtime limita el acceso del módulo a sus propias tablas y mantiene separado el estado del núcleo.

El Portable Backup conserva también el estado exportable de los módulos.

## 10. Seguridad e integridad

CAMELLO aplica:

- validación de entradas;
- transacciones SQLite;
- foreign keys;
- foreign_key_check e integrity_check;
- snapshots históricos de precio y costo;
- identificadores únicos de operación;
- auditoría de anulaciones;
- SHA-256 en respaldos;
- respaldo cifrado;
- PIN local opcional;
- aislamiento de módulos.

No deben almacenarse secretos ni keystores de release dentro del repositorio.

## 11. Calidad y CI

### Validación completa

~~~bash
npm ci
npm run verify
~~~

### Comandos individuales

~~~bash
npm run typecheck
npm run lint
npm run verify:vitest
npm run verify:e2e
npm run verify:db
npm run verify:modulos
npm run verify:security
npm run verify:ubicacion
npm run benchmark:db
npm run benchmark:scale
~~~

La CI también ejecuta pruebas instrumentadas de Android en un emulador antes de publicar el APK debug.

## 12. Desarrollo local

Instalar dependencias:

~~~bash
npm ci
~~~

Desarrollo web:

~~~bash
npm run dev
~~~

Build web:

~~~bash
npm run build
~~~

Sincronizar Capacitor:

~~~bash
npx cap sync android
~~~

Compilar APK debug:

~~~bash
cd android
./gradlew assembleDebug
~~~

## 13. Alcance

CAMELLO está pensado para el control diario de un negocio pequeño y para mantener la información disponible localmente.

No pretende reemplazar un ERP ni un sistema contable o fiscal especializado.

Fuera del alcance base:

- contabilidad fiscal avanzada;
- facturación electrónica;
- nómina e impuestos;
- inventario industrial de materias primas;
- costeo industrial por lotes;
- sincronización multi-dispositivo mediante servidor;
- GPS permanente en segundo plano;
- comercio electrónico.

Estas exclusiones son deliberadas: la prioridad es que lo que CAMELLO hace, lo haga de forma simple y confiable.

## 14. Estado del proyecto

La rama de referencia para el cierre de la versión 1 es `release/v1`.

Una release se considera preparada cuando el commit verificado, las pruebas, el APK y el mecanismo de recuperación de datos corresponden al mismo estado del código.

Antes de distribuir una versión debe comprobarse:

1. CI verde para el commit objetivo;
2. APK generado desde ese mismo commit;
3. generación de Portable Backup;
4. validación del Portable Backup;
5. restauración de prueba con integridad de la base.

## 15. Principio de conservación de datos

> **La aplicación puede cambiar. Los datos deben poder salir de ella y volver a entrar.**

Por eso el Portable Backup es un formato de primera clase del proyecto y debe evolucionar mediante versiones explícitas, migraciones y pruebas de compatibilidad.