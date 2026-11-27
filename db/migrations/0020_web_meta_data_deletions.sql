-- Pedidos de eliminación de datos que manda Meta (Data Deletion Request Callback) cuando
-- alguien quita DigiBot de su cuenta de Facebook y pide borrar sus datos. Meta recibe un
-- código y un link donde la persona ve el estado (/eliminacion-de-datos/estado?codigo=...).
-- Solo agrega una tabla: no cambia nada de lo existente.
CREATE TABLE IF NOT EXISTS web_meta_data_deletions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  confirmation_code CHAR(16) NOT NULL,
  -- user_id del signed_request (id de Meta por app de quien lo pidió)
  meta_user_id VARCHAR(64) NOT NULL,
  -- received: recibido · processed: se revisaron y borraron los accesos de Meta revocados
  status ENUM('received', 'processed') NOT NULL DEFAULT 'received',
  -- Cuántas conexiones quedaron desconectadas (y sin token) al procesarlo
  connections_removed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mdd_code (confirmation_code),
  KEY idx_mdd_user (meta_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
