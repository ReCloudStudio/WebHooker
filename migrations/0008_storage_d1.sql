-- D1 tables replacing ephemeral high-frequency KV keys (dedup, delivery state,
-- message tracking). Keeps KV for things that still benefit from key-based
-- access with short TTL; these tables relieve the KV write quota.

CREATE TABLE IF NOT EXISTS dedup_keys (
  key TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dedup_keys_expires_at ON dedup_keys (expires_at);

CREATE TABLE IF NOT EXISTS delivery_state (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_tracking (
  event_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_message_tracking_updated_at ON message_tracking (updated_at);