-- Audit trail for admin operations (logins, group/route/member/invite changes).
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor_id TEXT,
  actor_login TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  group_id TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_group ON audit_logs (group_id);
