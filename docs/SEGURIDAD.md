# Seguridad CAMELLO

## Activos
Clientes, teléfonos, ubicaciones, fotos, ventas, pagos, gastos, respaldos, configuración y credenciales de acceso local.

## Amenazas principales
Teléfono perdido/robado, persona con teléfono desbloqueado, respaldo expuesto, texto compartido o enlaces hostiles, archivo de respaldo alterado, dependencia comprometida, APK falsificado y secretos de firma filtrados.

## Controles implementados
- Android `allowBackup=false`.
- `usesCleartextTraffic=false` y Network Security Config solo HTTPS.
- WebView release con `FLAG_SECURE` y depuración desactivada.
- CSP estricta en la aplicación web.
- PIN local de 6 dígitos con PBKDF2-SHA256 y sal aleatoria.
- Retraso creciente tras PIN incorrecto sin borrar datos.
- Bloqueo por inactividad configurable.
- Respaldos cifrados con PBKDF2-SHA256 + AES-GCM.
- Límite de tamaño de respaldo de 25 MB.
- Checksum SHA-256 y validación antes de restaurar.
- Tablas y consultas de módulo opcional con prefijo.
- Entrada financiera en enteros COP y límites de longitud en textos de clientes/mascotas/productos.
- SQL parametrizado en operaciones de datos.
- Sin analítica, telemetría ni backend.

## SQLCipher
La base SQLite principal NO está cifrada con SQLCipher en esta versión. Se mantiene desactivado porque el protocolo exige demostrar una migración con snapshot, apertura de la base en APK actualizado, restauración en otro teléfono y comportamiento ante pérdida de la clave. Es una limitación conocida, no se oculta como si estuviera resuelta.

## Privacidad
CAMELLO no envía datos personales salvo acciones explícitas del usuario: exportar/compartir respaldo, compartir ubicación, abrir Google Maps/WhatsApp o usar conexiones explícitas del mapa. La pantalla de Configuración permite registrar el aviso de privacidad y el responsable del tratamiento.

Esto no constituye una declaración de cumplimiento legal. En Colombia, el dueño del negocio debe revisar sus obligaciones con asesoría jurídica.

## Release
El keystore nunca se guarda en el repositorio. Los secretos son exclusivamente GitHub Secrets:
- `CAMELLO_RELEASE_KEYSTORE_B64`
- `CAMELLO_KEYSTORE_PASSWORD`
- `CAMELLO_KEY_ALIAS`
- `CAMELLO_KEY_PASSWORD`

## Pendiente de teléfono
PIN real, bloqueo de pantalla en recientes, biometría, actualización encima de una versión instalada y restauración cifrada tras reinstalación requieren un dispositivo Android.
