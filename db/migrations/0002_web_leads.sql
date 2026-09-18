-- Leads capturados desde el form de contacto de la landing (antes del footer).
-- No confundir con "web_clients": esto son contactos entrantes sin calificar
-- todavía, no clientes activos del producto.

CREATE TABLE IF NOT EXISTS web_leads (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  accepted_policy TINYINT(1) NOT NULL DEFAULT 0,
  source VARCHAR(100) NOT NULL DEFAULT 'landing_contact_form',
  status ENUM('new', 'contacted', 'archived') NOT NULL DEFAULT 'new',
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leads_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
