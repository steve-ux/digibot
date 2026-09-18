-- Planes de precios de la landing (sección "Nuestros planes").
-- Editar precio/nombre/features acá impacta la web sin tocar código ni deployear:
-- la home revalida esta tabla cada 60s (ver `export const revalidate` en src/app/page.tsx).
--
-- `plan_key` matchea las claves de WA_LINKS en src/lib/whatsapp.ts (basico/premium/plus)
-- para armar el link de WhatsApp de cada botón "Elegir plan".

CREATE TABLE IF NOT EXISTS web_pricing_plans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_key VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  tagline VARCHAR(191) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'ARS',
  billing_period VARCHAR(30) NOT NULL DEFAULT '/mes',
  cta_label VARCHAR(100) NOT NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  -- Array JSON de strings, ej: ["Hasta 1.000 mensajes/mes", "WhatsApp Business", ...]
  features JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_plan_key (plan_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed con los planes que ya estaban hardcodeados en Pricing.tsx.
-- INSERT IGNORE + UNIQUE KEY(plan_key): esto solo carga una vez. Si ya existen
-- filas (por ejemplo porque las editaste a mano), correr la migración de nuevo
-- NO las pisa.
INSERT IGNORE INTO web_pricing_plans
  (plan_key, name, tagline, price, currency, billing_period, cta_label, is_featured, is_active, sort_order, features)
VALUES
  (
    'basico', 'Básico', 'Perfecto para empezar', 99.00, 'ARS', '/mes', 'Elegir Básico', 0, 1, 1,
    JSON_ARRAY(
      'Hasta 1.000 mensajes/mes',
      'WhatsApp Business',
      'Panel de control básico',
      'Soporte por email',
      'Entrenamiento básico de IA'
    )
  ),
  (
    'premium', 'Premium', 'Ideal para marcas en crecimiento', 199.00, 'ARS', '/mes', 'Elegir Premium', 1, 1, 2,
    JSON_ARRAY(
      'Hasta 5.000 mensajes/mes',
      'WhatsApp + Instagram + Facebook',
      'Panel de control avanzado',
      'Soporte prioritario',
      'IA personalizada avanzada',
      'Estadísticas detalladas',
      'Integración con CRM',
      'Soporta audios e imágenes'
    )
  ),
  (
    'plus', 'Plus+', 'Para empresas grandes', 399.00, 'ARS', '/mes', 'Elegir Plus+', 0, 1, 3,
    JSON_ARRAY(
      'Mensajes ilimitados',
      'WhatsApp + Instagram + Facebook',
      'Panel empresarial completo',
      'Soporte 24/7',
      'IA ultra personalizada',
      'Analytics avanzados',
      'Genera links de ventas',
      'Soporta audios e imágenes',
      'Entrenamiento personalizado'
    )
  );
