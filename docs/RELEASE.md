# RELEASE ANDROID — CAMELLO

## Debug
El workflow compila un APK debug con `versionName` semántico, `versionCode` creciente y SHA-256. El Artifact final del HEAD actual aún no está verificado.

## Release firmado
Requiere `CAMELLO_RELEASE_KEYSTORE_B64`, `CAMELLO_KEYSTORE_PASSWORD`, `CAMELLO_KEY_ALIAS`, `CAMELLO_KEY_PASSWORD`. Si faltan, se omite el firmado y queda el debug fallback.

## Actualización
Para instalar encima debe usarse la misma clave de firma; prueba manual pendiente.
