# CAMELLO

Aplicación Android local, offline-first, para que **COMBOPITT** registre clientes, mascotas,
ventas y rutas de venta puerta a puerta de productos naturales para mascotas en Villavicencio.

CAMELLO no es un ERP. No lleva contabilidad, ni gastos, ni facturación electrónica. Es una
herramienta de campo con un solo objetivo: convertir cada venta en información útil para volver
a vender.

## Qué incluye esta primera versión (v1.0)

- **Clientes**: ficha con teléfono, cumpleaños, ubicación (GPS, mapa o coordenadas) y mascotas.
- **Ventas**: precio y costo quedan congelados en el momento de la venta (no se recalculan si
  el precio del producto cambia después).
- **Rutas**: iniciar → registrar ventas sobre la marcha → finalizar, con resumen automático de
  llevados/vendidos/disponibles/utilidad.
- **Mapa**: todos los clientes con ubicación guardada, con filtros (activos, por contactar,
  inactivos, con pagos pendientes).
- **Seguimiento**: un cliente pasa a "por contactar" si no compra hace más de 20 días, e
  "inactivo" después de 45 (umbral ajustable en `src/db/database.ts`).
- **Informes**: hoy / semana / mes.
- **Respaldo**: exportar e importar toda la base de datos como un archivo `.json`, para que la
  información nunca dependa solo de que el teléfono no se pierda o se dañe.

Queda deliberadamente fuera de esta versión: contabilidad, proveedores, nómina, impuestos,
facturación electrónica, inventario avanzado, sincronización entre teléfonos, servidor,
IA/chat dentro de la app, GPS permanente y comercio electrónico.

## Cómo está construida

- **React + Vite + TypeScript** para la interfaz.
- **Capacitor** para empaquetarla como app Android real.
- **SQLite nativo** (`@capacitor-community/sqlite`) para guardar los datos en el teléfono —
  no depende del navegador ni de internet.
- **Leaflet + OpenStreetMap** para el mapa.
- **GitHub Actions** compila automáticamente el `.apk` en cada cambio (ver más abajo).

La carpeta `android/` ya viene generada y versionada en este repositorio: no hace falta correr
`npx cap add android` a mano.

## Cómo subir esto a GitHub (sin programar)

1. Entra a tu repositorio en GitHub (o crea uno nuevo, vacío).
2. Descomprime el `.zip` que te entregó Claude en tu computador.
3. En GitHub, usa **Add file → Upload files**, arrastra todo el contenido de la carpeta
   descomprimida (todo lo que está *dentro* de `camello/`, no la carpeta `camello` en sí) y
   confirma el commit.
   - Si el repo ya tenía una versión anterior de CAMELLO o de RUTAX, mejor pídele a Claude que
     lo suba directamente por ti usando la conexión con GitHub, para no pisar cosas sin querer.
4. Ve a la pestaña **Actions** de tu repositorio. Debería aparecer un flujo llamado
   "Compilar APK de CAMELLO" ejecutándose solo.
5. Cuando termine (unos minutos), entra a esa ejecución y baja hasta **Artifacts**: ahí vas a
   encontrar `camello-debug-apk`. Descárgalo, descomprímelo y ese `app-debug.apk` es el que
   instalas en tu celular (activa "instalar de orígenes desconocidos" si Android lo pide).

## Cómo seguir modificándola

Para cambios pequeños (un texto, un color, agregar un campo, corregir un error) lo más simple
es pedírselo a Claude conectado a tu cuenta de GitHub: puede leer el repo, hacer el cambio,
crear una rama y dejarte un Pull Request para que tú decidas si lo aprueba.

Para trabajar en tu computador en vez de en la nube:

```bash
npm install
npm run dev        # abre la app en el navegador (usa una base de datos de prueba en el navegador)
npm run build       # genera la versión web optimizada en dist/
npx cap sync android # copia esa versión dentro del proyecto Android
```

Para generar el `.apk` desde tu computador necesitas Android Studio instalado; para eso abre la
carpeta `android/` directamente con Android Studio.

## Estructura del proyecto

```
src/
  db/
    schema.ts      → definición de las tablas SQLite
    database.ts     → toda la lógica de acceso a datos (clientes, ventas, rutas, informes…)
  pages/            → una pantalla por archivo (Dashboard, Clientes, Rutas, Mapa, Informes…)
  components/       → piezas de interfaz reutilizables (por ahora, la barra inferior)
  types/            → los tipos de datos del negocio (Cliente, Venta, Ruta…)
  utils/            → formato de moneda, fechas, etc.
android/            → proyecto nativo Android generado por Capacitor (ya listo, no tocar a mano)
.github/workflows/  → la automatización que compila el APK
```

## Prioridad técnica (de mayor a menor)

1. Integridad de datos
2. Respaldo y restauración
3. Funcionamiento offline
4. Seguridad
5. Velocidad
6. Simplicidad
7. Ventas → Clientes → Rutas → Mapa e informes
