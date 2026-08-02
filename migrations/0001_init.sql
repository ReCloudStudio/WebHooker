CREATE TABLE IF NOT EXISTS send_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  route_id TEXT NOT NULL,
  event TEXT NOT NULL,
  repo TEXT,
  target TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_send_logs_ts ON send_logs (ts DESC);

CREATE TABLE IF NOT EXISTS discord_links (
  discord_user_id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL
);
