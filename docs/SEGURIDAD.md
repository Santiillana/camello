# Seguridad de CAMELLO

## Activos
Clientes, teléfonos, ubicaciones, fotos, ventas, cartera, rutas, gastos y respaldos.

## Amenazas y controles
- Teléfono perdido: PIN local con PBKDF2+sal, bloqueo por inactividad, FLAG_SECURE en release y allowBackup=false.
- Respaldo expuesto: respaldo cifrado AES-GCM con contraseña + PBKDF2; checksum y validación estricta.
- Entrada externa: longitud/tipo, SQL parametrizado, parser de ubicación sin HTML.
- WebView: HTTPS obligatorio, CSP, depuración desactivada en release, permisos mínimos.
- Dependencias: npm ci, npm audit --audit-level=high, acciones fijadas por major y permisos de workflow mínimos.
- APK: firma release opcional condicionada a cuatro secretos; keystore temporal eliminado.

## Cifrado SQLCipher
No se activa por defecto en esta versión porque no se puede demostrar aquí una migración/restauración cifrada completa sobre dos teléfonos reales. El riesgo residual queda documentado.

## Privacidad
No hay analítica ni telemetría. Las conexiones externas solo ocurren por acciones explícitas del usuario o por resolución de enlaces de ubicación permitidos.

## Riesgos residuales
- Un teléfono rooteado o una persona que conozca el PIN pueden acceder a los datos.
- La pérdida de la contraseña de un respaldo cifrado implica pérdida práctica de ese respaldo.
- GPS, cámara, compartir y actualización sobre instalación existente necesitan prueba física.
- El cumplimiento de Ley 1581 de 2012 debe ser revisado por el responsable del negocio con asesoría jurídica.

## Lo que la app NO protege
No protege frente a un dispositivo comprometido/root, una persona que conoce el PIN, ni frente a que el dueño comparta deliberadamente un respaldo sin cifrar.

## Checklist del dueño
1. Mantener bloqueo y cifrado de Android.
2. Activar PIN de CAMELLO.
3. Compartir respaldos cifrados fuera del teléfono.
4. Conservar la contraseña del respaldo cifrado.
5. Actualizar CAMELLO desde Artifacts/Release verificando SHA-256.