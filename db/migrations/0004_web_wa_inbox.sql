-- Bandeja de conversaciones de WhatsApp (/admin/bandeja). Base del futuro CRM.
--
--   web_wa_conversations -> un hilo por (número del negocio, número del cliente)
--   web_wa_messages      -> cada mensaje entrante/saliente, con su estado de entrega
--
-- Las columnas *_at son TIMESTAMP: se escriben con FROM_UNIXTIME() y se leen con
-- UNIX_TIMESTAMP() para no depender de la zona horaria de la sesión ni del server.

CREATE TABLE IF NOT EXISTS web_wa_conversations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- phone_number_id de Meta del número del negocio que recibió/envió el mensaje
  phone_number_id VARCHAR(64) NOT NULL,
  -- Número del cliente en formato wa_id (solo dígitos, con código de país)
  wa_id VARCHAR(32) NOT NULL,
  contact_name VARCHAR(191) NULL,
  last_message_preview VARCHAR(255) NULL,
  last_message_at TIMESTAMP NULL,
  -- Último mensaje del cliente: define la ventana de 24 h para texto libre
  last_inbound_at TIMESTAMP NULL,
  unread_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wac_phone_wa (phone_number_id, wa_id),
  KEY idx_wac_last_message (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_wa_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED NOT NULL,
  -- ID de mensaje de Meta. NULL mientras un saliente está "sending" o si falló antes de llegar a Meta.
  wamid VARCHAR(191) NULL,
  direction ENUM('in', 'out') NOT NULL,
  -- Tipo de la Cloud API: text, image, audio, template, button, interactive, etc.
  type VARCHAR(32) NOT NULL,
  body TEXT NULL,
  template_name VARCHAR(191) NULL,
  status ENUM('received', 'sending', 'sent', 'delivered', 'read', 'failed') NOT NULL,
  error_code INT NULL,
  error_title VARCHAR(255) NULL,
  raw_payload JSON NULL,
  message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_wam_wamid (wamid),
  KEY idx_wam_conversation (conversation_id, id),
  CONSTRAINT fk_wam_conversation FOREIGN KEY (conversation_id) REFERENCES web_wa_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
