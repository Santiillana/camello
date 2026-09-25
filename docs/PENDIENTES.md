# Pendientes y límites de v1

Este archivo registra únicamente lo que no puede declararse verificado con la infraestructura disponible.

## Evidencia que todavía requiere intervención del dueño

1. **Teléfono Android real.** No existe desde esta sesión un dispositivo físico conectado para demostrar instalación, uso bajo señal mala/batería baja y prueba visual de 1000 clientes.
2. **Firma release.** El repositorio ya exige cuatro secretos de firma, pero no contiene ni debe contener el keystore. Sin esos secretos no se puede ejecutar aquí una compilación release firmada real.
3. **Dos ubicaciones del keystore.** La copia del keystore fuera de Git debe quedar bajo control del dueño en dos ubicaciones distintas. No se puede verificar físicamente desde GitHub.
4. **Protección de `main`.** La integración GitHub disponible en esta sesión no permite confirmar ni modificar la configuración administrativa de protección de la rama; no se declara configurada.
5. **Prueba local literal.** El entorno actual no tiene acceso DNS a GitHub desde el contenedor, por lo que no se puede afirmar que `npm ci && npm run verify` haya pasado en la máquina local del dueño. Existen ejecuciones históricas de GitHub Actions correctamente terminadas, pero la integración de esta sesión todavía no expone la ejecución correspondiente al PR #6; por tanto tampoco se usa como evidencia del HEAD final.
6. **Estado de integración del PR #6.** GitHub lo reporta actualmente como `mergeable: false` y `release/v1` está 3 commits detrás de `main`. No se considera listo para merge hasta que GitHub vuelva a calcularlo como integrable o exista evidencia de que el bloqueo fue resuelto.

## Estado

No se considera cerrado el criterio final mientras cualquiera de los puntos anteriores carezca de evidencia real. No se maquilla como verde.
