# Instalar CAMELLO en Android

## APK debug
1. En GitHub entra a Actions.
2. Abre la última ejecución VERDE de “Compilar APK de CAMELLO”.
3. Descarga el Artifact `CAMELLO-debug-vX.Y.Z`.
4. Pasa el APK al teléfono.
5. Android puede pedir permiso para instalar aplicaciones de esa fuente: habilítalo solo para la aplicación desde la que instalas.
6. Abre CAMELLO.
7. Configura negocio y usuario.

El Artifact incluye un archivo `.sha256` para comprobar la integridad del APK.

## Release firmado
El workflow de release siempre puede producir un APK debug. El APK release firmado solo se produce si existen estos secretos:
`CAMELLO_RELEASE_KEYSTORE_B64`, `CAMELLO_KEYSTORE_PASSWORD`, `CAMELLO_KEY_ALIAS`, `CAMELLO_KEY_PASSWORD`.

## Crear un keystore
En una máquina segura:
```bash
keytool -genkeypair -v -keystore camello-release.jks -alias camello -keyalg RSA -keysize 4096 -validity 10000
```

El archivo no debe entrar al repositorio. Convierte el keystore a Base64 para cargar el primer secreto:
```bash
base64 -w0 camello-release.jks
```

## Pérdida de la clave
Si se pierde el keystore usado para firmar un APK instalado, Android no permitirá actualizar esa instalación con otra firma. La alternativa es desinstalar y perder los datos locales, salvo que exista un respaldo propio que luego pueda restaurarse.

## Actualización encima
La actualización encima de una instalación existente solo debe probarse con el mismo certificado de firma. Esta prueba es manual porque requiere un teléfono real.
