# Pendientes y límites de v1

Este archivo registra únicamente lo que no puede declararse verificado con la infraestructura disponible.

## Evidencia que todavía requiere intervención del dueño

1. **Teléfono Android real.** No existe desde esta sesión un dispositivo físico conectado para demostrar instalación, uso bajo señal mala/batería baja y prueba visual de 1000 clientes.
2. **Firma release.** El repositorio ya exige cuatro secretos de firma, pero no contiene ni debe contener el keystore. Sin esos secretos no se puede ejecutar aquí una compilación release firmada real.
3. **Dos ubicaciones del keystore.** La copia del keystore fuera de Git debe quedar bajo control del dueño en dos ubicaciones distintas. No se puede verificar físicamente desde GitHub.
4. **Protección de `main`.** El conector GitHub disponible permite lectura de protección pero no concede la escritura administrativa necesaria para activarla.
5. **Prueba local literal.** El entorno actual no tiene acceso DNS a GitHub desde el contenedor, por lo que no se puede afirmar que `npm ci && npm run verify` haya pasado en la máquina local del dueño. La evidencia de ejecución disponible es la de GitHub Actions.

## Estado

No se considera cerrado el criterio final mientras cualquiera de los puntos anteriores carezca de evidencia real. No se maquilla como verde.
