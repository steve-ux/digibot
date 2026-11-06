-- Suscripción de cada cuenta (Configuración → Suscripción). Por ahora la carga el
-- equipo de DigiBot a mano; cuando esté dLocal Go, la actualizan sus webhooks.
--
-- La tarjeta NUNCA se guarda acá: la carga el cliente en la página segura de
-- dLocal Go. Solo se guarda lo necesario para mostrarla ("Visa •••• 4242").

CREATE TABLE IF NOT EXISTS web_subscriptions (
  client_id INT UNSIGNED NOT NULL,
  -- web_pricing_plans.plan_key (basico / premium / plus)
  plan_key VARCHAR(50) NOT NULL,
  status ENUM('trial', 'active', 'past_due', 'canceled') NOT NULL DEFAULT 'active',
  -- Próximo cobro (o fin de la prueba / del período ya pagado si se canceló)
  current_period_end TIMESTAMP NULL,
  -- Pidió cancelar: sigue activa hasta current_period_end y después no se renueva
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  payment_brand VARCHAR(30) NULL,
  payment_last4 CHAR(4) NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'manual',
  provider_subscription_id VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id),
  KEY idx_subs_provider (provider, provider_subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
