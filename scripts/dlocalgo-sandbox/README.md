# Pruebas del cobro con dLocal Go (SANDBOX)

> Guía completa (variables, flujo y checklist para producción): [docs/cobros-dlocalgo.md](../../docs/cobros-dlocalgo.md).

Todo lo de esta carpeta usa **solo** las variables `*_SANDBOX` de `.env.local` y aborta si
la URL no es de sandbox. No cobra nada real.

| Archivo | Para qué |
|---|---|
| `create-payment.mjs` | Crea un pago con `allow_transparent` + `allow_recurring` (`node --env-file=.env.local scripts/dlocalgo-sandbox/create-payment.mjs AR ARS 10000`) |
| `server.mjs` | Página mínima con SmartFields en http://localhost:4599 (prueba aislada de la API, sin la app) |
| `recurring.mjs` | Cobro recurrente con un token (`… recurring.mjs <token> [monto] [order_id]`) o `… recurring.mjs get <DP-…>` |
| `test-prices.sql` | **Precios de prueba** para los 8 países (reemplazar antes de producción) |
| `simulate-suspension.sql` | Deja la cuenta de prueba #3 suspendida por falta de pago (para probar el acceso solo-para-pagar) |
| `run-sql.mjs` | Ejecuta un `.sql` contra la base de `.env.local` |
| `cycle.sandbox.ts` | Corre el ciclo de cobro real (MySQL + sandbox) adelantando la fecha: `npx vitest run --config scripts/dlocalgo-sandbox/vitest.sandbox.config.ts` |

## Cuenta de prueba (borrar al terminar las pruebas)

- Cuenta: **PRUEBA SANDBOX - borrar** (`web_clients.id = 3`, suscripción `#1`)
- Admin: `sandbox-billing-test@example.com` · contraseña de prueba: `Sbx-d3zMxgTTn8Mq`

## Tarjetas de prueba (docs de dLocal Go)

- Aprobadas: `4111 1111 1111 1111`, `4242 4242 4242 4242` (cualquier vencimiento futuro y CVV)
- Rechazadas: `5555 5555 5555 4444` (banco), `4000 0566 5566 5556` (fondos), `5186 0017 0000 9726` (vencida),
  `5105 1051 0510 5100` (CVV), `5120 3501 0006 4537` (riesgo). En el checkout transparente todas vuelven como
  `406 "Missing payment method"` (sin motivo).
- Documento AR de prueba: DNI `30123456`.
