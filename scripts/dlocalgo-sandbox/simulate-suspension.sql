-- SOLO PRUEBAS: deja la cuenta de prueba (#3, suscripción #1) como la deja el motor
-- después de 7 días sin pago: suscripción suspendida, panel y bot bloqueados.
UPDATE web_billing_subscriptions
SET status = 'suspended', failed_attempts = 4, past_due_since = current_period_end, suspended_at = NOW(), next_charge_on = NULL
WHERE id = 1 AND client_id = 3;
UPDATE web_clients SET status = 'suspended', bot_enabled = 0, bot_disabled_reason = 'billing_suspended' WHERE id = 3;
