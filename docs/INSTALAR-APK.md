# INSTALAR-APK.md

## APK debug
1. Ir a GitHub → Actions → Compilar APK de CAMELLO.
2. Abrir la ejecución verde más reciente.
3. Descargar el Artifact CAMELLO-debug-v....
4. Pasar el APK al teléfono Android.
5. Permitir instalación desde la fuente usada para abrir el APK.
6. Instalar y abrir CAMELLO.
7. Comparar el SHA-256 con el archivo .sha256 adjunto.

## APK firmado
Requiere CAMELLO_RELEASE_KEYSTORE_B64, CAMELLO_KEYSTORE_PASSWORD, CAMELLO_KEY_ALIAS y CAMELLO_KEY_PASSWORD en GitHub Secrets.

## Keystore
Crear uno nuevo solo si todavía no existe:
keytool -genkeypair -v -keystore camello-release.jks -alias camello -keyalg RSA -keysize 2048 -validity 10000
base64 -w 0 camello-release.jks
Guardar el resultado como CAMELLO_RELEASE_KEYSTORE_B64 y crear los otros tres secretos con sus valores.

## Actualización
Una actualización firmada con la misma clave y applicationId debe instalarse encima conservando SQLite; esto requiere validación manual.