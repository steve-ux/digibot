-- Canales por plan:
--   Premium -> ecosistema Meta: WhatsApp, Instagram, Facebook y Threads
--   Plus+   -> todo Meta + YouTube, Telegram y TikTok
-- Solo reemplaza el renglón viejo "WhatsApp + Instagram + Facebook"; si ya se
-- editó a mano (y no está), no toca nada.

UPDATE web_pricing_plans
SET features = JSON_REPLACE(
  features,
  JSON_UNQUOTE(JSON_SEARCH(features, 'one', 'WhatsApp + Instagram + Facebook')),
  'WhatsApp + Instagram, Facebook y Threads (todo Meta)'
)
WHERE plan_key = 'premium' AND JSON_SEARCH(features, 'one', 'WhatsApp + Instagram + Facebook') IS NOT NULL;

UPDATE web_pricing_plans
SET features = JSON_REPLACE(
  features,
  JSON_UNQUOTE(JSON_SEARCH(features, 'one', 'WhatsApp + Instagram + Facebook')),
  'Todo Meta + YouTube, Telegram y TikTok'
)
WHERE plan_key = 'plus' AND JSON_SEARCH(features, 'one', 'WhatsApp + Instagram + Facebook') IS NOT NULL;

