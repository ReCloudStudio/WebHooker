import { log } from "./log";

export interface SendRecord {
  ts: number;
  routeId: string;
  event: string;
  repo?: string;
  target: string;
  ok: boolean;
  error?: string;
}

export async function recordSend(db: D1Database, record: SendRecord): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT INTO send_logs (ts, route_id, event, repo, target, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.ts,
        record.routeId,
        record.event,
        record.repo ?? null,
        record.target,
        record.ok ? 1 : 0,
        record.error ?? null,
      )
      .run();
  } catch (err) {
    log.warn({ err }, "Failed to record send log");
  }
}

export async function getSendLog(db: D1Database, limit = 50): Promise<SendRecord[]> {
  try {
    const { results } = await db
      .prepare("SELECT * FROM send_logs ORDER BY ts DESC LIMIT ?")
      .bind(limit)
      .all<{ ts: number; route_id: string; event: string; repo: string | null; target: string; ok: number; error: string | null }>();
    return results.map((r) => ({
      ts: r.ts,
      routeId: r.route_id,
      event: r.event,
      repo: r.repo ?? undefined,
      target: r.target,
      ok: r.ok === 1,
      error: r.error ?? undefined,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to load send log");
    return [];
  }
}
