-- Cuentas (multi-tenant), Superadmin, etiquetas y atributos propios.
--
-- Una "cuenta" es una fila de web_clients (ya existía para esto: la conexión de
-- WhatsApp de cada cliente cuelga de ahí). Las URLs del panel llevan su id:
--   /admin/cuentas/7/conversaciones/11  -> cuenta 7, conversación 11
--
--   superadmin -> equipo de DigiBot: ve todas las cuentas, crea cuentas y administradores
--   admin      -> administra SU cuenta (supervisores, agentes, etiquetas, atributos)
--
-- Todo lo que ya existe queda en la primera cuenta (la interna de DigiBot).

-- Si la base no tiene ninguna cuenta todavía, se crea la interna.
INSERT INTO web_clients (name, status)
SELECT 'DigiBot (interno)', 'active' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM web_clients);

SET @default_account = (SELECT MIN(id) FROM web_clients);

-- ---------- Conversaciones ----------

ALTER TABLE web_wa_conversations
  ADD COLUMN client_id INT UNSIGNED NULL AFTER id,
  -- Valores de los atributos propios de la cuenta: {"dni": "30111222", "ciudad": "Rosario"}
  ADD COLUMN attributes JSON NULL AFTER tags,
  ADD KEY idx_wac_client_last (client_id, last_message_at);

-- WhatsApp: la cuenta dueña del número; el resto (IG, FB, Threads), la cuenta por defecto.
UPDATE web_wa_conversations c
LEFT JOIN web_whatsapp_connections w ON c.channel = 'wa' AND w.phone_number_id = c.phone_number_id
SET c.client_id = COALESCE(w.client_id, @default_account)
WHERE c.client_id IS NULL;

UPDATE web_channel_accounts SET client_id = @default_account WHERE client_id IS NULL;

-- ---------- Usuarios ----------

ALTER TABLE web_users
  MODIFY COLUMN role ENUM('superadmin', 'admin', 'supervisor', 'agent') NOT NULL DEFAULT 'agent',
  ADD KEY idx_users_client (client_id);

-- Superadmin: client_id NULL (no pertenece a ninguna cuenta, entra a todas).
-- El resto de las personas creadas hasta ahora son de la cuenta por defecto.
UPDATE web_users SET client_id = @default_account WHERE client_id IS NULL AND role <> 'superadmin';

-- ---------- Etiquetas ----------

CREATE TABLE IF NOT EXISTS web_labels (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  -- Clave de la paleta (src/lib/crm/labels.ts): blue, green, amber, red, violet, pink, teal, gray
  color VARCHAR(16) NOT NULL DEFAULT 'blue',
  description VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_label_client_name (client_id, name),
  CONSTRAINT fk_label_client FOREIGN KEY (client_id) REFERENCES web_clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Las etiquetas que venían fijas en la plataforma, para cada cuenta existente.
INSERT IGNORE INTO web_labels (client_id, name, color)
SELECT c.id, l.name, l.color
FROM web_clients c
CROSS JOIN (
  SELECT 'Cliente nuevo' AS name, 'blue' AS color
  UNION ALL SELECT 'Consulta de precio', 'amber'
  UNION ALL SELECT 'Venta', 'green'
  UNION ALL SELECT 'Turno', 'violet'
  UNION ALL SELECT 'Reclamo', 'red'
) l;

-- ---------- Atributos propios ----------

CREATE TABLE IF NOT EXISTS web_custom_attributes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NOT NULL,
  -- Clave estable para el bot y las integraciones (snake_case): "dni", "obra_social"
  attr_key VARCHAR(64) NOT NULL,
  label VARCHAR(80) NOT NULL,
  type ENUM('text', 'number', 'date', 'list', 'checkbox', 'link') NOT NULL DEFAULT 'text',
  -- Opciones del tipo "list": ["OSDE", "Swiss Medical"]
  options JSON NULL,
  description VARCHAR(191) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_attr_client_key (client_id, attr_key),
  CONSTRAINT fk_attr_client FOREIGN KEY (client_id) REFERENCES web_clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
