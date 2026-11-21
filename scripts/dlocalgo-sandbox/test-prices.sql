-- PRECIOS DE PRUEBA (sandbox). No son los precios reales: reemplazar antes de producción.
-- Montos por encima de los mínimos de dLocal Go en cada país (en ARS, $1.000 da "Amount too low").
INSERT INTO web_plan_prices (plan_key, country, currency, amount) VALUES
  ('basico','AR','ARS',15000),  ('premium','AR','ARS',30000),  ('plus','AR','ARS',60000),
  ('basico','BR','BRL',80),     ('premium','BR','BRL',160),    ('plus','BR','BRL',320),
  ('basico','CL','CLP',15000),  ('premium','CL','CLP',30000),  ('plus','CL','CLP',60000),
  ('basico','CO','COP',60000),  ('premium','CO','COP',120000), ('plus','CO','COP',240000),
  ('basico','MX','MXN',300),    ('premium','MX','MXN',600),    ('plus','MX','MXN',1200),
  ('basico','PE','PEN',60),     ('premium','PE','PEN',120),    ('plus','PE','PEN',240),
  ('basico','PY','PYG',100000), ('premium','PY','PYG',200000), ('plus','PY','PYG',400000),
  ('basico','UY','UYU',600),    ('premium','UY','UYU',1200),   ('plus','UY','UYU',2400)
ON DUPLICATE KEY UPDATE currency = VALUES(currency), amount = VALUES(amount), is_active = 1;
