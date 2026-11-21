-- Marca de "bot apagado" por cuenta, para que los workflows de n8n sepan si tienen
-- que responder. La maneja el cobro: se apaga al suspender por falta de pago (o al
-- terminar una suscripción cancelada) y se vuelve a prender sola cuando la cuenta paga.
--
-- Cómo leerla desde n8n (por el número que recibió el mensaje):
--   SELECT c.bot_enabled
--   FROM web_whatsapp_connections w JOIN web_clients c ON c.id = w.client_id
--   WHERE w.phone_number_id = '{{phone_number_id}}';
-- bot_enabled = 0 -> no responder.

ALTER TABLE web_clients
  ADD COLUMN bot_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER status,
  -- billing_suspended | subscription_ended | manual
  ADD COLUMN bot_disabled_reason VARCHAR(40) NULL AFTER bot_enabled;
