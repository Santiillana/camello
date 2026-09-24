# Release Android

## Debug
GitHub Actions compila `camello-debug.apk` para pruebas internas.

## Release firmado
El workflow de release requiere estos secretos de GitHub:

- `CAMELLO_RELEASE_KEYSTORE_B64`
- `CAMELLO_KEYSTORE_PASSWORD`
- `CAMELLO_KEY_ALIAS`
- `CAMELLO_KEY_PASSWORD`

El keystore se materializa solo durante el job y nunca se sube al repositorio.

El `versionCode` debe ser creciente. El workflow usa el número de ejecución como valor por defecto del release.

## Instalación encima
La firma debe ser la misma que la versión instalada para conservar datos y permitir actualización encima. La primera prueba de actualización se marca manual y requiere teléfono.
