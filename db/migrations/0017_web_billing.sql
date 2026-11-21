-- Cobro automático con dLocal Go (Checkout Transparente + Recurring Payments).
-- Solo aditiva: web_subscriptions (0012) queda como está y se sigue actualizando
-- desde el código para que todo lo que ya la lee siga funcionando.
--
-- La tarjeta nunca llega a DigiBot: SmartFields la tokeniza en el navegador. Lo que
-- sí se guarda es el merchant_checkout_token (equivale a "la tarjeta guardada"),
-- siempre cifrado con AES-256-GCM (src/lib/crypto.ts).

-- Precio de cada plan por país, en moneda local. Sin fila (o is_active = 0) el plan
-- no se puede contratar en ese país. Los montos los carga DigiBot: no hay seed.
CREATE TABLE IF NOT EXISTS web_plan_prices (
  plan_key VARCHAR(50) NOT NULL,
  country CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_key, country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Una fila por suscripción. Una cuenta tiene como mucho una "viva" (active,
-- past_due o suspended); eso lo controla el código.
--   incomplete -> se creó el checkout y todavía no se aprobó el primer pago
--   active     -> al día
--   past_due   -> falló el cobro; se reintenta según web_billing_settings
--   suspended  -> pasaron los días de gracia sin pago: panel y bot bloqueados
--   cancelled  -> terminó (pidió cancelar y llegó el fin del período, o la dio de baja DigiBot)
CREATE TABLE IF NOT EXISTS web_billing_subscriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- NULL mientras es un cliente nuevo que todavía no pagó (la cuenta se crea al aprobarse)
  client_id INT UNSIGNED NULL,
  plan_key VARCHAR(50) NOT NULL,
  country CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,
  -- Monto que se le cobra a esta suscripción (queda fijo aunque cambie la lista de precios)
  amount DECIMAL(12, 2) NOT NULL,
  status ENUM('incomplete', 'active', 'past_due', 'suspended', 'cancelled') NOT NULL DEFAULT 'incomplete',
  -- Día del mes del alta (1-31): se cobra ese día; en meses más cortos, el último día
  billing_anchor_day TINYINT UNSIGNED NULL,
  current_period_start DATE NULL,
  current_period_end DATE NULL,
  next_charge_on DATE NULL,
  -- merchant_checkout_token cifrado (AES-256-GCM)
  card_token_enc TEXT NULL,
  card_brand VARCHAR(30) NULL,
  card_last4 CHAR(4) NULL,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  past_due_since DATE NULL,
  suspended_at TIMESTAMP NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  cancelled_at TIMESTAMP NULL,
  -- Baja de plan: se aplica en el próximo cobro
  pending_plan_key VARCHAR(50) NULL,
  pending_amount DECIMAL(12, 2) NULL,
  -- Cliente nuevo desde la web: {businessName, name, email}. Se usa al aprobarse el pago.
  signup JSON NULL,
  -- Token de invitación del admin recién creado, cifrado, para mostrarlo una vez en
  -- la página de resultado (por si el mail no llega). Se borra a las 24 h.
  signup_invite_enc TEXT NULL,
  signup_invite_expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bsub_client (client_id, status),
  KEY idx_bsub_charge (status, next_charge_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cada intento de cobro. order_id es UNIQUE: el mismo cobro nunca se manda dos veces
-- (y dLocal Go además rechaza un order_id repetido con 904 "Duplicated invoice id").
--   SUB-{id}-{AAAAMM}-{intento}      alta, renovación y reintentos
--   SUB-{id}-{AAAAMM}-UP{n}          diferencia por mejora de plan
--   SUB-{id}-{AAAAMM}-CARD{n}        pago con otra tarjeta desde el panel
CREATE TABLE IF NOT EXISTS web_subscription_payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id INT UNSIGNED NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  kind ENUM('initial', 'renewal', 'upgrade', 'card_update') NOT NULL,
  -- Referencia pública aleatoria (success_url, página de resultado): no expone ids
  public_ref CHAR(32) NOT NULL,
  dlocal_payment_id VARCHAR(64) NULL,
  -- merchant_checkout_token de este pago, cifrado (para alta y cambio de tarjeta)
  checkout_token_enc TEXT NULL,
  -- Plan que paga este cobro (en una mejora, el plan nuevo)
  plan_key VARCHAR(50) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  -- created: todavía no se mandó a dLocal · unknown: se cortó la respuesta (se reconcilia)
  status ENUM('created', 'pending', 'paid', 'rejected', 'cancelled', 'expired', 'unknown') NOT NULL DEFAULT 'created',
  rejected_reason VARCHAR(191) NULL,
  -- Marca y últimos 4 de la tarjeta con que se pagó (la marca la informa SmartFields)
  card_brand VARCHAR(30) NULL,
  card_last4 CHAR(4) NULL,
  -- Período que cubre (renovación/alta)
  period_start DATE NULL,
  period_end DATE NULL,
  raw_response JSON NULL,
  paid_at TIMESTAMP NULL,
  -- Factura (ARCA): se completa en la fase de facturación
  invoice_ref VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_spay_order (order_id),
  UNIQUE KEY uniq_spay_ref (public_ref),
  UNIQUE KEY uniq_spay_dlocal (dlocal_payment_id),
  KEY idx_spay_sub (subscription_id, created_at),
  CONSTRAINT fk_spay_sub FOREIGN KEY (subscription_id) REFERENCES web_billing_subscriptions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Parámetros del cobro (una sola fila, id = 1). Todo editable sin tocar código.
CREATE TABLE IF NOT EXISTS web_billing_settings (
  id TINYINT UNSIGNED NOT NULL,
  -- Días después del vencimiento en que se reintenta el cobro
  retry_days JSON NOT NULL,
  -- Días sin pago hasta suspender la cuenta
  grace_days TINYINT UNSIGNED NOT NULL,
  -- Prueba gratis (0 = sin prueba). Pendiente de definir con comercial.
  trial_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- Aviso mínimo antes de aplicar un precio nuevo a quien ya está suscripto
  price_change_notice_days SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  -- WhatsApp de los superadmins para avisos de pagos fallidos (coma separada, E.164 sin +). Vacío = no se manda.
  superadmin_whatsapp VARCHAR(191) NULL,
  -- Plantilla aprobada (UTILITY) del número de DigiBot para ese aviso
  failed_payment_template VARCHAR(191) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Valores acordados: 3 reintentos (días 1, 3 y 5) y 7 días de gracia.
INSERT IGNORE INTO web_billing_settings (id, retry_days, grace_days, trial_days, price_change_notice_days)
VALUES (1, JSON_ARRAY(1, 3, 5), 7, 0, 60);

-- Eventos de cobro (outbox). PaymentApproved dispara la facturación (ARCA, fase aparte).
-- UNIQUE(type, payment_id): un pago aprobado genera un solo evento aunque llegue
-- la notificación varias veces.
CREATE TABLE IF NOT EXISTS web_billing_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type VARCHAR(50) NOT NULL,
  subscription_id INT UNSIGNED NOT NULL,
  payment_id INT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_bev (type, payment_id),
  KEY idx_bev_pending (processed_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
