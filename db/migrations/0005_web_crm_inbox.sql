-- Bandeja omnicanal (CRM): estado de la conversación, IA, asignación, etiquetas,
-- nota del contacto y autor de cada mensaje. Todo con defaults, así que el código
-- anterior (que no conoce estas columnas) sigue funcionando sobre la misma base.
--
-- Las tablas conservan el prefijo web_wa_ por compatibilidad: desde acá guardan
-- conversaciones de cualquier canal (columna channel).

ALTER TABLE web_wa_conversations
  ADD COLUMN channel ENUM('wa', 'ig', 'igc', 'fb') NOT NULL DEFAULT 'wa' AFTER id,
  ADD COLUMN status ENUM('open', 'resolved') NOT NULL DEFAULT 'open' AFTER unread_count,
  -- "IA respondiendo": por ahora es solo un flag; la integración con el bot viene después.
  ADD COLUMN bot_active TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  -- Id del usuario del panel (web_users llega con la etapa de Equipo).
  ADD COLUMN assignee_id INT UNSIGNED NULL AFTER bot_active,
  ADD COLUMN tags JSON NULL AFTER assignee_id,
  ADD COLUMN note TEXT NULL AFTER tags,
  -- Quién escribió el último mensaje visible: "Vos:" / "DigiBot:" en la lista y filtro "Sin responder".
  ADD COLUMN last_message_author ENUM('customer', 'bot', 'agent') NULL AFTER last_message_preview,
  -- Cuántas veces se abrió la conversación (sube cuando el cliente escribe sobre una resuelta).
  ADD COLUMN session_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER note,
  ADD COLUMN resolved_at TIMESTAMP NULL AFTER session_count,
  ADD KEY idx_wac_status (status, last_message_at);

ALTER TABLE web_wa_messages
  -- internal = notas del equipo y avisos del sistema: nunca salen hacia Meta.
  MODIFY COLUMN direction ENUM('in', 'out', 'internal') NOT NULL,
  ADD COLUMN author ENUM('customer', 'bot', 'agent', 'system', 'note') NULL AFTER direction,
  ADD COLUMN author_name VARCHAR(191) NULL AFTER author;

UPDATE web_wa_messages SET author = IF(direction = 'in', 'customer', 'agent') WHERE author IS NULL;

UPDATE web_wa_conversations c
SET c.last_message_author = (
  SELECT IF(m.direction = 'in', 'customer', 'agent')
  FROM web_wa_messages m
  WHERE m.conversation_id = c.id AND m.direction <> 'internal'
  ORDER BY m.id DESC
  LIMIT 1
)
WHERE c.last_message_author IS NULL;
