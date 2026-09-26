# RELEASE ANDROID — CAMELLO v1.0.0

## Debug

El workflow build-apk.yml ejecuta npm ci, npm run verify, npx cap sync android y assembleDebug, y publica el APK junto con SHA-256 cuando esos pasos pasan.

La compilación debug puede verificarse en CI. La instalación en un teléfono físico y la validación visual del APK requieren un dispositivo real accesible al responsable del proyecto.

## Release firmado

El workflow build-release.yml exige estos secretos de GitHub:

- CAMELLO_RELEASE_KEYSTORE_B64
- CAMELLO_KEYSTORE_PASSWORD
- CAMELLO_KEY_ALIAS
- CAMELLO_KEY_PASSWORD

El keystore se materializa temporalmente dentro de android/, se usa para assembleRelease y se elimina en un paso always(). La clave privada no se almacena en el repositorio.

El criterio de firma solo puede marcarse como verificado cuando una ejecución real de build-release.yml haya producido el APK firmado. Además, la custodia en dos ubicaciones independientes debe verificarse fuera de GitHub por el responsable del repositorio.

## Permisos Android

El Manifest declara únicamente:

- android.permission.INTERNET
- android.permission.ACCESS_COARSE_LOCATION
- android.permission.ACCESS_FINE_LOCATION

No declara cámara, micrófono, contactos ni almacenamiento externo. android:allowBackup=false impide la copia automática del sistema.

## Mapa y red

Los datos y operaciones locales siguen disponibles sin red. Los tiles de OpenStreetMap no son offline en v1, por lo que una ruta/mapa visual requiere conectividad para cargar el mapa base.

## Instalación manual

    adb install -r CAMELLO-debug-v1.0.0.apk

La instalación y las pruebas de volumen con 1000 clientes deben ejecutarse y observarse en el teléfono antes de marcar esos criterios como cumplidos.