CREATE TABLE IF NOT EXISTS d1_fragments (
  id TEXT NOT NULL,
  group_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  node TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_d1_fragments_group_id ON d1_fragments(group_id);
