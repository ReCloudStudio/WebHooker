import { log } from "./log";

export interface AuditEntry {
  id?: number;
  ts: number;
  actorId?: string;
  actorLogin?: string;
  /** Machine-readable action, e.g. "session.login", "group.update", "invite.create". */
  action: string;
  targetType?: string;
  targetId?: string;
  groupId?: string;
  /** Free-form metadata. Never include secrets or message bodies. */
  detail?: Record<string, unknown>;
  ip?: string;
}

const COLUMNS = "id, ts, actor_id, actor_login, action, target_type, target_id, group_id, detail, ip";

interface AuditRow {
  id: number;
  ts: number;
  actor_id: string | null;
  actor_login: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  group_id: string | null;
  detail: string | null;
  ip: string | null;
}

function toEntry(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    ts: r.ts,
    actorId: r.actor_id ?? undefined,
    actorLogin: r.actor_login ?? undefined,
    action: r.action,
    targetType: r.target_type ?? undefined,
    targetId: r.target_id ?? undefined,
    groupId: r.group_id ?? undefined,
    detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : undefined,
    ip: r.ip ?? undefined,
  };
}

/** Best-effort write; failures never break the business flow. */
export async function recordAudit(db: D1Database, entry: AuditEntry): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (ts, actor_id, actor_login, action, target_type, target_id, group_id, detail, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.ts,
        entry.actorId ?? null,
        entry.actorLogin ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.groupId ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
        entry.ip ?? null,
      )
      .run();
  } catch (err) {
    log.warn({ err, action: entry.action }, "Failed to record audit entry");
  }
}

export async function getAuditLog(
  db: D1Database,
  opts: { groupId?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  try {
    if (opts.groupId) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM audit_logs WHERE group_id = ? ORDER BY ts DESC LIMIT ?`)
        .bind(opts.groupId, limit)
        .all<AuditRow>();
      return results.map(toEntry);
    }
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM audit_logs ORDER BY ts DESC LIMIT ?`)
      .bind(limit)
      .all<AuditRow>();
    return results.map(toEntry);
  } catch (err) {
    log.warn({ err }, "Failed to load audit log");
    return [];
  }
}

export async function pruneAuditLogs(db: D1Database, retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 86400_000;
  try {
    const { meta } = await db.prepare("DELETE FROM audit_logs WHERE ts < ?").bind(cutoff).run();
    return meta.changes;
  } catch (err) {
    log.warn({ err }, "Failed to prune audit logs");
    return 0;
  }
}
