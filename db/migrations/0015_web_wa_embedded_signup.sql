-- WhatsApp con Embedded Signup (v5, con coexistencia) y detección de desconexión.
-- Solo aditiva: no se borra ni se renombra nada.
--
--   web_whatsapp_connections  -> + salud de la conexión (active / needs_attention / disconnected),
--                                motivo de la desconexión, coexistencia, pasos del onboarding,
--                                sincronización con la app de WhatsApp Business
--   web_wa_signup_sessions    -> una por cada vez que alguien abre el Embedded Signup
--   web_wa_signup_events      -> lo que mandó Meta durante esa sesión (para el panel interno)
--   web_wa_webhook_jobs       -> webhooks pesados (history, smb_app_state_sync) para procesar en segundo plano
--   web_wa_contacts           -> contactos que sincroniza la app de WhatsApp Business (coexistencia)
--   web_notifications         -> avisos en el panel (client_id NULL = para los superadmins)
--
-- `status` sigue siendo lo que era: 'connected' = el número está vinculado a la cuenta;
-- 'revoked' = lo desconectaron desde el panel. `health` dice si de verdad funciona.

ALTER TABLE web_whatsapp_connections
  ADD COLUMN health ENUM('active', 'needs_attention', 'disconnected') NOT NULL DEFAULT 'active' AFTER status,
  -- { reason, initiated_by, source: "webhook" | "token_check" | "graph_error", at }
  ADD COLUMN disconnection_info JSON NULL AFTER health,
  ADD COLUMN is_coexistence TINYINT(1) NOT NULL DEFAULT 0 AFTER business_id,
  -- PIN de verificación en dos pasos con el que se registró el número (AES-256-GCM)
  ADD COLUMN pin_enc TEXT NULL AFTER access_token_enc,
  -- { token|subscribe|register|sync_state|sync_history: { status, error, at } }
  ADD COLUMN onboarding JSON NULL AFTER meta,
  -- request_id de smb_app_data: si está, no se vuelve a pedir (Meta permite una sola vez)
  ADD COLUMN sync_state_request_id VARCHAR(191) NULL AFTER onboarding,
  ADD COLUMN history_request_id VARCHAR(191) NULL AFTER sync_state_request_id,
  ADD COLUMN history_status ENUM('none', 'pending', 'in_progress', 'done', 'declined', 'error') NOT NULL DEFAULT 'none' AFTER history_request_id,
  ADD COLUMN history_progress TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER history_status,
  ADD COLUMN last_error VARCHAR(500) NULL AFTER history_progress,
  ADD COLUMN last_error_at TIMESTAMP NULL AFTER last_error,
  ADD COLUMN health_checked_at TIMESTAMP NULL AFTER last_error_at,
  ADD COLUMN signup_session_id CHAR(36) NULL AFTER health_checked_at,
  ADD KEY idx_wc_waba (waba_id),
  ADD KEY idx_wc_health (status, health);

CREATE TABLE IF NOT EXISTS web_wa_signup_sessions (
  id CHAR(36) NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  -- Si es una reconexión, la conexión que se quiere reconectar
  reconnect_connection_id INT UNSIGNED NULL,
  status ENUM('pending', 'onboarding', 'done', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  -- Token de negocio cifrado, mientras la sesión no termina (después vive en la conexión)
  access_token_enc TEXT NULL,
  code_received_at TIMESTAMP NULL,
  event_type VARCHAR(64) NULL,
  waba_id VARCHAR(64) NULL,
  phone_number_id VARCHAR(64) NULL,
  business_id VARCHAR(64) NULL,
  is_coexistence TINYINT(1) NOT NULL DEFAULT 0,
  -- session_id que manda Meta en los eventos (para soporte)
  meta_session_id VARCHAR(191) NULL,
  current_step VARCHAR(64) NULL,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  connection_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wss_client (client_id, created_at),
  KEY idx_wss_connection (connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_wa_signup_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id CHAR(36) NOT NULL,
  -- message (postMessage de Meta) · code · step (paso del onboarding) · error
  kind VARCHAR(32) NOT NULL,
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wse_session (session_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_wa_webhook_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- history · smb_app_state_sync
  field VARCHAR(64) NOT NULL,
  waba_id VARCHAR(64) NULL,
  phone_number_id VARCHAR(64) NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'processing', 'done', 'failed') NOT NULL DEFAULT 'pending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error VARCHAR(500) NULL,
  locked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wwj_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_wa_contacts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone_number_id VARCHAR(64) NOT NULL,
  wa_id VARCHAR(32) NOT NULL,
  full_name VARCHAR(191) NULL,
  first_name VARCHAR(191) NULL,
  removed_at TIMESTAMP NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wct_phone_wa (phone_number_id, wa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- NULL = aviso para los superadmins
  client_id INT UNSIGNED NULL,
  kind VARCHAR(64) NOT NULL,
  title VARCHAR(191) NOT NULL,
  body VARCHAR(1000) NULL,
  link VARCHAR(255) NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_client (client_id, read_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
