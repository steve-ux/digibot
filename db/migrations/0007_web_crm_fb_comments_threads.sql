-- Comentarios de Facebook (fbc) y respuestas en Threads (th) en la bandeja.
--   fbc: wa_id = "<id de quien comenta>:<id de la publicación>"
--   th:  wa_id = "<@usuario>:<id del hilo raíz>" (los webhooks de Threads traen el usuario, no un id)

ALTER TABLE web_wa_conversations
  MODIFY COLUMN channel ENUM('wa', 'ig', 'igc', 'fb', 'fbc', 'th') NOT NULL DEFAULT 'wa';

-- Threads tiene su propia cuenta y token (no depende de una página de Facebook).
ALTER TABLE web_channel_accounts
  MODIFY COLUMN channel ENUM('ig', 'fb', 'th') NOT NULL,
  MODIFY COLUMN page_id VARCHAR(64) NULL;
