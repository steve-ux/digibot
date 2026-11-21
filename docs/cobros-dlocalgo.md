# Cobro mensual con dLocal Go

Suscripción mensual de los planes Básico, Premium y Plus+ sin que el cliente salga de digibotlatam.com:
**Checkout Transparente (SmartFields)** para el alta y **Recurring Payments** (`merchant_checkout_token`)
para los cobros siguientes.

## Reglas que el código garantiza

- Los datos de la tarjeta se cargan en un iframe de dLocal Go: el servidor de DigiBot solo recibe un
  `cardToken` de un solo uso. El API secret vive solo en el backend.
- El `merchant_checkout_token` (equivale a la tarjeta guardada) se guarda cifrado con `TOKEN_ENCRYPTION_KEY`.
- Un cobro nunca se duplica: `order_id` único por intento (`SUB-{id}-{AAAAMM}-{n}`), lock por suscripción
  y lock global del ciclo (MySQL `GET_LOCK`), y dLocal rechaza un `order_id` repetido (904).
- Nunca se confía en el cuerpo de la notificación: se verifica la firma HMAC y se consulta
  `GET /v1/payments/{id}`. Un monto o una moneda distintos a los esperados no activan nada y avisan al equipo.
- Si el proceso se corta después de aprobado un pago, la notificación siguiente (o el ciclo siguiente)
  lo termina de aplicar, una sola vez (evento `PaymentApproved`).

## Cómo funciona

| Momento | Qué pasa |
|---|---|
| Alta (`/suscripcion/[plan]`) | `POST /v1/payments` con `allow_transparent` y `allow_recurring` → SmartFields → `confirm`. Con 3DS redirige al banco. Si el cliente es nuevo, la cuenta se crea al aprobarse el pago y recibe un link para elegir la contraseña (24 h). |
| Día de cobro | El mismo día del alta cada mes (si el mes no tiene ese día, el último). El job corre cada hora desde `BILLING_RUN_HOUR` (hora de Argentina). |
| Cobro fallido | Reintentos los días 1, 3 y 5; aviso por mail en cada fallo. A los 7 días de gracia se **suspende** (panel y bot). |
| Suspendida | El admin entra solo a Configuración → Suscripción para pagar con otra tarjeta. Al pagar se reactiva sola. |
| Mejora de plan | Se cobra la diferencia prorrateada en el momento. |
| Baja de plan | Rige desde el próximo cobro; se muestran las ventajas que se pierden. |
| Cancelación | Al fin del período pagado; se puede deshacer antes. |
| Comprobante | PDF de cada pago aprobado en el historial (no es factura; ARCA queda para otra etapa, ver `invoice_ref`). |

**Bot apagado:** `web_clients.bot_enabled = 0` con `bot_disabled_reason` = `billing_suspended` o
`subscription_ended`. n8n tiene que leer esa columna (la consulta está en
`db/migrations/0018_web_clients_bot_flag.sql`).

**Límites por plan:** `src/lib/billing/entitlements.ts` (por ahora, lo que dice la landing). Una cuenta sin
suscripción de dLocal Go (las que ya existían) no tiene límites.

### Archivos

- Lógica: `src/lib/billing/` (`service.ts` alta y notificaciones, `engine.ts` ciclo y cambios, `job.ts` horario,
  `runtime.ts` mails, avisos y acceso, `receipt.ts` PDF).
- Endpoints: `src/app/api/billing/*` (públicos, con CSRF) y `src/app/api/admin/cuentas/[accountId]/suscripcion/*`.
- Panel del superadmin: `/admin/cuentas/cobros` (MRR por moneda, en mora, fallidos, reintento manual).
- Base: `db/migrations/0017_web_billing.sql` y `0018_web_clients_bot_flag.sql`.
- Tests: `tests/billing-*.test.ts` (con un dLocal Go falso, `tests/helpers/dlocal-fake.ts`).

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DLOCALGO_ENV` | `sandbox` (por defecto) o `production`. |
| `DLOCALGO_API_KEY`, `DLOCALGO_API_SECRET`, `DLOCALGO_SMARTFIELDS_KEY` | Claves de producción. Solo se leen con `DLOCALGO_ENV=production`. |
| `DLOCALGO_*_SANDBOX` | Las mismas tres, de la cuenta sandbox (es una cuenta aparte). Solo se leen en sandbox. |
| `DLOCALGO_API_URL[_SANDBOX]`, `DLOCALGO_SDK_URL[_SANDBOX]` | Opcionales. Si la URL no coincide con el entorno (`api-sbx` vs `api`), el cobro se apaga solo. |
| `BILLING_PUBLIC_URL` | URL pública para el resultado y las notificaciones. Por defecto `APP_URL`. En local, la del túnel. |
| `DLOCALGO_NOTIFICATION_URL` | Opcional. Por defecto `<BILLING_PUBLIC_URL>/api/billing/dlocalgo/notificaciones`. |
| `BILLING_RUN_HOUR` | Hora desde la que se cobran las renovaciones (0-23, Argentina). Por defecto 9. |
| `WA_BACKGROUND_JOBS` | El job de cobro corre dentro de las tareas en segundo plano. En `off` no hay cobro automático. |
| `TOKEN_ENCRYPTION_KEY` | Cifra las tarjetas guardadas. **Si cambia, se pierden todas** y cada cliente tiene que volver a cargar la tarjeta. |
| `SMTP_*`, `ALERTS_EMAIL` | Mails a clientes (pago aprobado, fallido, suspensión) y alertas al equipo. Sin SMTP solo quedan en el panel. |

Configuración de negocio en la base (`web_billing_settings`, fila `id = 1`): días de reintento, días de
gracia, días de prueba gratis, aviso por cambio de precio, WhatsApp del superadmin y plantilla de aviso
(formato `nombre|idioma`, con 3 parámetros). Precios por plan y país: `web_plan_prices`. El plan solo
muestra el checkout en la landing donde tiene precio cargado; en el resto sigue yendo a WhatsApp.

## Probar en sandbox

1. En `.env.local`: `DLOCALGO_ENV=sandbox` y las tres `DLOCALGO_*_SANDBOX`.
2. Precios de prueba: `node --env-file=.env.local scripts/dlocalgo-sandbox/run-sql.mjs scripts/dlocalgo-sandbox/test-prices.sql`
   (en ARS el mínimo de dLocal Go es más de 1000).
3. Túnel para que lleguen las notificaciones (se usa un config vacío porque `~/.cloudflared/config.yml` es el de n8n):

   ```powershell
   New-Item -ItemType File -Force "$env:TEMP\cloudflared-vacio.yml" | Out-Null
   cloudflared tunnel --config "$env:TEMP\cloudflared-vacio.yml" --url http://localhost:3000
   ```

   Copiar la URL `https://….trycloudflare.com` a `BILLING_PUBLIC_URL` y reiniciar `npm run dev`
   (cambia en cada arranque).
4. Contratar desde la landing (Precios → plan) o desde Configuración → Suscripción.
5. Tarjetas de prueba y la cuenta de prueba: `scripts/dlocalgo-sandbox/README.md`. Aprobada: `4111 1111 1111 1111`,
   vencimiento futuro, cualquier CVV, DNI `30123456`.
6. Para no esperar un mes:
   - Ciclo real adelantando la fecha: `npx vitest run --config scripts/dlocalgo-sandbox/vitest.sandbox.config.ts`.
   - Suspensión: `node --env-file=.env.local scripts/dlocalgo-sandbox/run-sql.mjs scripts/dlocalgo-sandbox/simulate-suspension.sql` → entrar con el admin de la cuenta
     de prueba → solo ve Suscripción → pagar con otra tarjeta → se reactiva (`bot_enabled = 1`).
7. Tests sin red: `npm test`.

## Checklist para pasar a producción

**Antes**

- [ ] Claves de producción en el `.env` del VPS y `DLOCALGO_ENV=production`. La SmartFields key de producción
      se pide al soporte de dLocal Go (no es la de sandbox). Preguntarles también si hay que habilitar el dominio
      `digibotlatam.com` para SmartFields.
- [ ] `BILLING_PUBLIC_URL` y `DLOCALGO_NOTIFICATION_URL` vacías (usan `APP_URL=https://digibotlatam.com`).
- [ ] `https://digibotlatam.com/api/billing/dlocalgo/notificaciones` accesible desde internet (sin firma responde 401;
      sin claves, 503).
- [ ] `WA_BACKGROUND_JOBS` vacío u `on` en el VPS.
- [ ] `TOKEN_ENCRYPTION_KEY` del VPS = la de siempre (no generar una nueva).
- [ ] SMTP configurado en el VPS (hoy `.env.local` no lo tiene) y `ALERTS_EMAIL`.
- [ ] Migraciones 0017 y 0018 aplicadas en la base de producción (ya lo están en la compartida; si producción usa
      otra, aplicarlas ahí).
- [ ] **Reemplazar los precios de prueba** en `web_plan_prices` por los reales, por plan y país.
- [ ] Definir con el socio y cargar en `web_billing_settings`: prueba gratis (`trial_days`), aviso por cambio de
      precio, WhatsApp del superadmin + plantilla aprobada en Meta. Y los límites definitivos por plan en
      `entitlements.ts`.
- [ ] Borrar la cuenta de prueba "PRUEBA SANDBOX - borrar" (`web_clients.id = 3`) con su suscripción y sus pagos.
- [ ] Confirmar que n8n deja de responder cuando `bot_enabled = 0`.

**Prueba de humo (producción)**

- [ ] Alta real con una tarjeta propia en el plan más barato → llega la notificación → suscripción activa,
      mail de pago aprobado, comprobante PDF descargable desde el historial.
- [ ] Ver el pago en `/admin/cuentas/cobros` y en el panel de dLocal Go.
- [ ] Cancelar esa suscripción y reembolsar el pago desde el panel de dLocal Go.

**Después**

- [ ] Primer día de renovaciones: revisar `/admin/cuentas/cobros` y los logs `[billing]`.
- [ ] Si un pago queda `unknown` ("Cobro a reconciliar"), buscar su `order_id` en el panel de dLocal Go: el sistema
      no lo vuelve a cobrar y lo cierra cuando llega la notificación.
