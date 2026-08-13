import { pruneAuditLogs } from "../lib/lib/audit";
import { cfEnv } from "../lib/cf";
import { log } from "../lib/lib/log";

/** Scheduled: prune audit log entries past AUDIT_RETENTION_DAYS (cron every 5 minutes). */
export default defineTask({
  meta: { name: "audit:prune", description: "Prune old audit log entries" },
  async run(event) {
    try {
      const env = cfEnv(event);
      const days = Math.max(Number(env.AUDIT_RETENTION_DAYS ?? 90) || 90, 1);
      const removed = await pruneAuditLogs(env.DB, days);
      if (removed > 0) log.info({ removed }, "Pruned audit logs");
      return { result: "ok", removed };
    } catch (err) {
      log.error({ err }, "Audit log prune from cron failed");
      return { result: "error" };
    }
  },
});
