-- Instagram (DMs y comentarios) y Messenger en la misma bandeja.
--
-- web_wa_conversations ya tiene `channel`. Para los canales nuevos:
--   phone_number_id -> id de la cuenta del negocio en ese canal (page_id / ig_user_id)
--   wa_id           -> id del contacto en ese canal (PSID / IGSID). En comentarios
--                      de Instagram: "<id del que comenta>:<id de la publicación>",
--                      una conversación por persona y publicación.
-- Por eso wa_id se agranda y la clave única pasa a incluir el canal (la misma
-- persona puede tener un DM y un hilo de comentarios con la misma cuenta).

ALTER TABLE web_wa_conversations
  MODIFY COLUMN wa_id VARCHAR(191) NOT NULL,
  -- @usuario (Instagram) o nombre de la cuenta (Messenger)
  ADD COLUMN handle VARCHAR(191) NULL AFTER contact_name,
  -- Publicación comentada (canal igc): { mediaId, caption, likes, comments, thumbnailUrl, permalink }
  ADD COLUMN post JSON NULL AFTER handle,
  DROP INDEX uniq_wac_phone_wa,
  ADD UNIQUE KEY uniq_wac_channel_account_contact (channel, phone_number_id, wa_id);

-- Cuentas de Instagram / Messenger conectadas (la etapa de Canales las gestiona;
-- mientras tanto se pueden cargar a mano o usar las variables META_PAGE_* / META_IG_*).
CREATE TABLE IF NOT EXISTS web_channel_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NULL,
  channel ENUM('ig', 'fb') NOT NULL,
  -- page_id (Messenger) o ig_user_id (Instagram): es el entry.id de los webhooks
  account_id VARCHAR(64) NOT NULL,
  -- Página de Facebook vinculada (Instagram envía con el token de esa página)
  page_id VARCHAR(64) NOT NULL,
  -- "@opticasol" / "Óptica Sol": lo que se muestra en Canales
  display_name VARCHAR(191) NULL,
  -- Token de página cifrado con AES-256-GCM (src/lib/crypto.ts)
  access_token_enc TEXT NULL,
  status ENUM('connected', 'disconnected', 'error') NOT NULL DEFAULT 'connected',
  connected_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_ca_channel_account (channel, account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
