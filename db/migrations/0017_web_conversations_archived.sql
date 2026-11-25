-- Archivar conversaciones desde la bandeja: dejan de verse en la lista, sin borrar nada.
-- Si el cliente vuelve a escribir, se desarchivan solas (igual que una resuelta se reabre).
ALTER TABLE web_wa_conversations
  ADD COLUMN archived_at TIMESTAMP NULL,
  ADD KEY idx_wac_client_archived (client_id, archived_at);
