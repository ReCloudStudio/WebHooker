CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_user_id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL
);
