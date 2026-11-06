-- Textos de los planes (sigue a la 0013):
--   "todo Meta" -> "Universo META" en Premium y Plus+
--   Plus+  -> suma "Integración con Google Sheets"
--   Básico -> suma "Soporta audios e imágenes"
-- Cada cambio se aplica solo si el texto viejo está / el nuevo falta: no pisa
-- ediciones a mano ni duplica renglones.

UPDATE web_pricing_plans
SET features = JSON_REPLACE(
  features,
  JSON_UNQUOTE(JSON_SEARCH(features, 'one', 'WhatsApp + Instagram, Facebook y Threads (todo Meta)')),
  'WhatsApp + Instagram, Facebook y Threads (Universo META)'
)
WHERE plan_key = 'premium' AND JSON_SEARCH(features, 'one', 'WhatsApp + Instagram, Facebook y Threads (todo Meta)') IS NOT NULL;

UPDATE web_pricing_plans
SET features = JSON_REPLACE(
  features,
  JSON_UNQUOTE(JSON_SEARCH(features, 'one', 'Todo Meta + YouTube, Telegram y TikTok')),
  'Universo META + YouTube, Telegram y TikTok'
)
WHERE plan_key = 'plus' AND JSON_SEARCH(features, 'one', 'Todo Meta + YouTube, Telegram y TikTok') IS NOT NULL;

UPDATE web_pricing_plans
SET features = JSON_ARRAY_APPEND(features, '$', 'Integración con Google Sheets')
WHERE plan_key = 'plus' AND JSON_SEARCH(features, 'one', 'Integración con Google Sheets') IS NULL;

UPDATE web_pricing_plans
SET features = JSON_ARRAY_APPEND(features, '$', 'Soporta audios e imágenes')
WHERE plan_key = 'basico' AND JSON_SEARCH(features, 'one', 'Soporta audios e imágenes') IS NULL;
