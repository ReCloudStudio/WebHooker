import type { SendRecord } from "./send-log";
import { log } from "./log";

export async function recordSendBatch(db: D1Database, records: SendRecord[]): Promise<void> {
  if (records.length === 0) return;
  try {
    const stmts = records.map((r) =>
      db
        .prepare(
          `INSERT INTO send_logs (ts, route_id, group_id, event, repo, target, ok, error, status, message_id, delivery_id, platform, actor, action, duration_ms, error_code, attempts, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          r.ts,
          r.routeId,
          r.groupId ?? null,
          r.event,
          r.repo ?? null,
          r.target,
          r.ok ? 1 : 0,
          r.error ?? null,
          r.status ?? null,
          r.messageId ?? null,
          r.deliveryId ?? null,
          r.platform ?? null,
          r.actor ?? null,
          r.action ?? null,
          r.durationMs ?? null,
          r.errorCode ?? null,
          r.attempts ?? null,
          r.detail ? JSON.stringify(r.detail) : null,
        ),
    );
    await db.batch(stmts);
  } catch (err) {
    log.warn({ err, count: records.length }, "Failed to record send log batch");
  }
}
