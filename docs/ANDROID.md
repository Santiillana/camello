# Android: procedimiento de construcción

## Requisitos

- Fedora/Linux con Node 24 y npm compatible con el lockfile.
- JDK 21.
- Android SDK con platform 36 y build-tools 36.0.0.
- Java/Android paths correctamente configurados.
- Un dispositivo o emulador con depuración autorizada para instalar.

## Construcción debug

```bash
npm ci
npm run verify
npx cap sync android
chmod +x android/gradlew
cd android
./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## Release firmado

El keystore no se guarda en Git. El workflow de release espera:

- `CAMELLO_RELEASE_KEYSTORE_B64`
- `CAMELLO_KEYSTORE_PASSWORD`
- `CAMELLO_KEY_ALIAS`
- `CAMELLO_KEY_PASSWORD`

La clave debe mantenerse fuera del repositorio y respaldarse en dos ubicaciones independientes.

## Instalación

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

La prueba de instalación real es un criterio manual y debe observarse en un teléfono o emulador.

## Permisos

El Manifest declara INTERNET y ubicación aproximada/precisa. La aplicación usa internet para tiles de OpenStreetMap y enlaces/servicios externos, y ubicación para capturar coordenadas. No se declara cámara, micrófono, contactos ni almacenamiento externo.

## Red

`network_security_config.xml` mantiene tráfico claro desactivado y anclaje a certificados del sistema.

## Mapa

Los datos de clientes siguen disponibles sin red, pero los tiles de OpenStreetMap requieren internet. CAMELLO no presenta esto como mapa offline.
