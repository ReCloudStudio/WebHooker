CREATE TABLE IF NOT EXISTS d1_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS d1_routes (
  id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  filters TEXT NOT NULL,
  targets TEXT NOT NULL,
  stop INTEGER NOT NULL DEFAULT 0,
  fallback INTEGER NOT NULL DEFAULT 0,
  discord_role_ids TEXT,
  ast TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, group_id),
  FOREIGN KEY (group_id) REFERENCES d1_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_d1_routes_group_id ON d1_routes(group_id);