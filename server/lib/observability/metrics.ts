import { log } from "../lib/log";
import { getFailedSendLog, type SendRecord } from "../lib/send-log";

export interface DeliveryMetrics {
  total: number;
  ok: number;
  failed: number;
  failureRate: number;
  byPlatform: { platform: string; total: number; ok: number; failed: number }[];
  byEvent: { event: string; total: number; ok: number; failed: number }[];
  byStatus: { status: string; count: number }[];
  avgDurationMs: number;
  totalAttempts: number;
  avgAttempts: number;
  recentFailures: SendRecord[];
}

interface TotalsRow {
  total: number;
  ok: number;
}

interface BreakdownRow {
  key: string | null;
  total: number;
  ok: number;
}

interface StatusRow {
  status: number;
  count: number;
}

interface AvgRow {
  avg: number | null;
}

interface AttemptsRow {
  total: number;
  avg: number | null;
}

const EMPTY: DeliveryMetrics = {
  total: 0,
  ok: 0,
  failed: 0,
  failureRate: 0,
  byPlatform: [],
  byEvent: [],
  byStatus: [],
  avgDurationMs: 0,
  totalAttempts: 0,
  avgAttempts: 0,
  recentFailures: [],
};

export async function getDeliveryMetrics(db: D1Database, groupId?: string): Promise<DeliveryMetrics> {
  const where = groupId ? " WHERE group_id = ?" : "";
  const and = groupId ? " AND group_id = ?" : "";
  const bindGroup = (stmt: D1PreparedStatement): D1PreparedStatement =>
    groupId ? stmt.bind(groupId) : stmt;

  try {
    const totals = await bindGroup(
      db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(ok), 0) AS ok FROM send_logs${where}`),
    ).all<TotalsRow>();
    const total = Number(totals.results[0]?.total) || 0;
    const ok = Number(totals.results[0]?.ok) || 0;

    const byPlatform = await bindGroup(
      db.prepare(
        `SELECT platform AS key, COUNT(*) AS total, COALESCE(SUM(ok), 0) AS ok
         FROM send_logs${where} GROUP BY platform`,
      ),
    ).all<BreakdownRow>();
    const byEvent = await bindGroup(
      db.prepare(
        `SELECT event AS key, COUNT(*) AS total, COALESCE(SUM(ok), 0) AS ok
         FROM send_logs${where} GROUP BY event`,
      ),
    ).all<BreakdownRow>();
    const byStatus = await bindGroup(
      db.prepare(
        `SELECT status, COUNT(*) AS count FROM send_logs
         WHERE status IS NOT NULL${and} GROUP BY status`,
      ),
    ).all<StatusRow>();
    const duration = await bindGroup(
      db.prepare(`SELECT AVG(duration_ms) AS avg FROM send_logs WHERE duration_ms IS NOT NULL${and}`),
    ).all<AvgRow>();
    const attempts = await bindGroup(
      db.prepare(
        `SELECT COALESCE(SUM(attempts), 0) AS total, AVG(attempts) AS avg
         FROM send_logs WHERE attempts IS NOT NULL${and}`,
      ),
    ).all<AttemptsRow>();
    const recentFailures = await getFailedSendLog(db, 20, groupId);

    return {
      total,
      ok,
      failed: total - ok,
      failureRate: total > 0 ? (total - ok) / total : 0,
      byPlatform: byPlatform.results.map((r) => {
        const t = Number(r.total) || 0;
        const o = Number(r.ok) || 0;
        return { platform: r.key ?? "unknown", total: t, ok: o, failed: t - o };
      }),
      byEvent: byEvent.results.map((r) => {
        const t = Number(r.total) || 0;
        const o = Number(r.ok) || 0;
        return { event: r.key ?? "unknown", total: t, ok: o, failed: t - o };
      }),
      byStatus: byStatus.results.map((r) => ({
        status: String(r.status),
        count: Number(r.count) || 0,
      })),
      avgDurationMs: Number(duration.results[0]?.avg) || 0,
      totalAttempts: Number(attempts.results[0]?.total) || 0,
      avgAttempts: Number(attempts.results[0]?.avg) || 0,
      recentFailures,
    };
  } catch (err) {
    log.warn({ err }, "Failed to compute delivery metrics");
    return EMPTY;
  }
}
