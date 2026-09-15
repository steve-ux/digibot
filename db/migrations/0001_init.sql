-- Esquema base para digibot-web dentro de la base compartida "digibot_data".
-- Prefijo "web_" para no chocar con las tablas que ya usan los workflows de n8n.
--
-- Modelo:
--   web_clients               -> un cliente/tenant (incluye "DigiBot (interno)" para la cuenta propia)
--   web_whatsapp_connections  -> la conexión de WhatsApp Business (WABA) de cada cliente
--   web_templates             -> cache/registro de las plantillas creadas y su estado en Meta

CREATE TABLE IF NOT EXISTS web_clients (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(50) NULL,
  status ENUM('onboarding', 'active', 'suspended') NOT NULL DEFAULT 'onboarding',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_whatsapp_connections (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NOT NULL,
  waba_id VARCHAR(64) NOT NULL,
  phone_number_id VARCHAR(64) NULL,
  business_id VARCHAR(64) NULL,
  -- Token cifrado con AES-256-GCM (ver src/lib/crypto.ts), nunca en texto plano.
  access_token_enc TEXT NOT NULL,
  token_type ENUM('system_user', 'user') NOT NULL DEFAULT 'system_user',
  status ENUM('pending', 'connected', 'revoked', 'error') NOT NULL DEFAULT 'pending',
  connected_at TIMESTAMP NULL,
  meta JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wc_client (client_id),
  CONSTRAINT fk_wc_client FOREIGN KEY (client_id) REFERENCES web_clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_templates (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  connection_id INT UNSIGNED NOT NULL,
  meta_template_id VARCHAR(64) NULL,
  name VARCHAR(191) NOT NULL,
  language VARCHAR(20) NOT NULL,
  category ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION') NOT NULL,
  status ENUM('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED') NOT NULL DEFAULT 'PENDING',
  components JSON NOT NULL,
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_tpl_connection_name_lang (connection_id, name, language),
  KEY idx_tpl_connection (connection_id),
  CONSTRAINT fk_tpl_connection FOREIGN KEY (connection_id) REFERENCES web_whatsapp_connections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
