-- Facebook (Messenger + comentarios) e Instagram (Instagram API with Unified Login)
-- como dos conexiones separadas, cola de webhooks de Meta y comentarios editados /
-- borrados. Solo agrega columnas y tablas: no cambia nada de lo existente.

-- Cómo se conectó cada cuenta:
--   page       -> por la página de Facebook (token de página). Messenger, y el Instagram viejo vinculado a una página.
--   ig_unified -> Instagram API with Unified Login: token de usuario del sistema del
--                 portfolio del cliente; se llama a graph.facebook.com con el id de la cuenta de IG.
-- Salud de la conexión (mismo modelo que WhatsApp): la usa la Fase B (error 190, deauthorize, debug_token diario).
ALTER TABLE web_channel_accounts
  ADD COLUMN auth_type ENUM('page', 'ig_unified') NOT NULL DEFAULT 'page' AFTER page_id,
  -- client_business_id del portfolio comercial (Unified Login)
  ADD COLUMN business_id VARCHAR(64) NULL AFTER auth_type,
  -- configuración de Facebook Login for Business con la que se conectó
  ADD COLUMN config_id VARCHAR(64) NULL AFTER business_id,
  ADD COLUMN health ENUM('active', 'needs_attention', 'disconnected') NOT NULL DEFAULT 'active' AFTER status,
  ADD COLUMN last_error VARCHAR(500) NULL AFTER health,
  ADD COLUMN last_error_at TIMESTAMP NULL AFTER last_error,
  ADD COLUMN health_checked_at TIMESTAMP NULL AFTER last_error_at,
  ADD COLUMN disconnection_info JSON NULL AFTER health_checked_at;

-- Comentarios:
--   in_reply_to -> id del comentario al que responde un saliente (público o por privado).
--                  Sirve para no responder dos veces por privado el mismo comentario.
--   edited_at / deleted_at -> el autor editó o borró su comentario (webhook feed de Facebook).
ALTER TABLE web_wa_messages
  ADD COLUMN in_reply_to VARCHAR(191) NULL AFTER wamid,
  ADD COLUMN edited_at TIMESTAMP NULL,
  ADD COLUMN deleted_at TIMESTAMP NULL,
  ADD KEY idx_wam_in_reply_to (in_reply_to);

-- Cola de webhooks de /webhooks/meta: se guarda el body firmado, se responde 200 al
-- toque y un worker lo procesa. dedupe_key = sha256 del body: si Meta reintenta la
-- misma entrega, no se encola dos veces (los mensajes además se deduplican por mid).
CREATE TABLE IF NOT EXISTS web_meta_webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dedupe_key CHAR(64) NOT NULL,
  -- page · instagram
  object VARCHAR(32) NULL,
  payload JSON NOT NULL,
  status ENUM('pending', 'processing', 'done', 'failed') NOT NULL DEFAULT 'pending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error VARCHAR(500) NULL,
  locked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_mwe_dedupe (dedupe_key),
  KEY idx_mwe_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
