-- Comentarios de TikTok (canal ttc) en la bandeja.
--   ttc: wa_id = "<unique_identifier de quien comenta>:<id del video>" (una conversación
--        por persona y video, igual que los comentarios de Instagram).
--        phone_number_id = open_id de la cuenta de TikTok conectada.
-- La cuenta de TikTok se guarda en web_channel_accounts con channel = 'tt'
-- (account_id = open_id). El refresh token (vale 1 año) va cifrado dentro de meta.
-- Solo agrega valores a los ENUM: no cambia nada de lo existente.

ALTER TABLE web_wa_conversations
  MODIFY COLUMN channel ENUM('wa', 'ig', 'igc', 'fb', 'fbc', 'th', 'ttc') NOT NULL DEFAULT 'wa';

ALTER TABLE web_channel_accounts
  MODIFY COLUMN channel ENUM('ig', 'fb', 'th', 'tt') NOT NULL;
