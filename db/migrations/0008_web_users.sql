-- Usuarios del panel (Equipo) con roles y canales.
--
--   admin       -> todo, incluido Equipo, Canales y Plantillas
--   supervisor  -> todas las conversaciones y Métricas; sin configuración
--   agent       -> solo la Bandeja de los canales asignados (columna channels)
--
-- Mientras no exista ningún administrador activo, el login acepta la contraseña
-- compartida ADMIN_PANEL_PASSWORD (cuenta inicial) para poder crear el primero.

CREATE TABLE IF NOT EXISTS web_users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(191) NOT NULL,
  role ENUM('admin', 'supervisor', 'agent') NOT NULL DEFAULT 'agent',
  -- ["wa","ig","igc","fb","fbc","th"]: solo aplica a agentes
  channels JSON NULL,
  status ENUM('invited', 'active', 'disabled') NOT NULL DEFAULT 'invited',
  -- scrypt (ver src/lib/crm/passwords.ts); NULL hasta que acepta la invitación
  password_hash VARCHAR(255) NULL,
  -- SHA-256 del token de invitación (el token en sí nunca se guarda)
  invite_token_hash CHAR(64) NULL,
  invite_expires_at TIMESTAMP NULL,
  -- Se incrementa al desactivar o cambiar la contraseña: invalida las sesiones abiertas
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_email (email),
  KEY idx_users_invite (invite_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
