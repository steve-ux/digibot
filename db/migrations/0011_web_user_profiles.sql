-- Perfil personal de cada usuario del panel (Configuración → Mi perfil / Sonidos).
-- Tabla aparte de web_users para que el login no dependa de esta migración.
-- user_id = web_users.id (0 = acceso inicial con la contraseña compartida).

CREATE TABLE IF NOT EXISTS web_user_profiles (
  user_id INT UNSIGNED NOT NULL,
  -- Foto ya recortada y achicada en el navegador (256x256, ~20-40 KB)
  avatar MEDIUMBLOB NULL,
  avatar_mime VARCHAR(32) NULL,
  -- Sube con cada foto nueva: va en la URL para que el navegador la cachee sin quedar vieja
  avatar_version INT UNSIGNED NOT NULL DEFAULT 0,
  -- {"sounds": {"enabled": true, "volume": 70, "channels": {"wa": "bubble", ...}}}
  preferences JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
