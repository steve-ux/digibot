-- Canales: conexión de cuentas desde el panel (Embedded Signup de WhatsApp,
-- Facebook Login for Business para páginas e Instagram, OAuth de Threads).

-- WhatsApp: número visible y nombre verificado (para mostrar en Canales) y
-- un número de teléfono no puede estar conectado a dos cuentas a la vez.
ALTER TABLE web_whatsapp_connections
  ADD COLUMN display_phone_number VARCHAR(32) NULL AFTER phone_number_id,
  ADD COLUMN verified_name VARCHAR(191) NULL AFTER display_phone_number,
  -- Quién lo conectó (web_users.id; NULL si vino de las variables de entorno)
  ADD COLUMN connected_by INT UNSIGNED NULL AFTER connected_at,
  ADD UNIQUE KEY uniq_wc_phone_number (phone_number_id);

-- Páginas, Instagram y Threads: cuándo vence el token (Threads dura 60 días y se
-- renueva solo) y datos para mostrar (foto, nombre de la página vinculada).
ALTER TABLE web_channel_accounts
  ADD COLUMN token_expires_at TIMESTAMP NULL AFTER access_token_enc,
  ADD COLUMN meta JSON NULL AFTER status,
  ADD COLUMN connected_by INT UNSIGNED NULL AFTER connected_at,
  ADD KEY idx_ca_client (client_id);
