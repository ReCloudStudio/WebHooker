import { cfEnv } from "../lib/cf";
import { log } from "../lib/lib/log";

const DELIVERY_STATE_RETENTION_MS = 7 * 24 * 3600 * 1000;
const MESSAGE_TRACKING_RETENTION_MS = 30 * 24 * 3600 * 1000;

/**
 * Scheduled: purge expired rows from the D1-backed ephemeral stores
 * (dedup_keys, delivery_state, message_tracking). These replaced the KV keys
 * that relied on per-entry TTL; D1 rows must be removed by this task instead.
 */
export default defineTask({
  meta: { name: "storage:prune", description: "Prune D1 dedup/delivery/message-tracking rows" },
  async run(event) {
    try {
      const env = cfEnv(event);
      const now = Date.now();
      let removed = 0;
      const dedup = await env.DB.prepare("DELETE FROM dedup_keys WHERE expires_at < ?")
        .bind(now)
        .run();
      removed += dedup.meta?.changes ?? 0;
      const delivery = await env.DB.prepare("DELETE FROM delivery_state WHERE updated_at < ?")
        .bind(now - DELIVERY_STATE_RETENTION_MS)
        .run();
      removed += delivery.meta?.changes ?? 0;
      const messages = await env.DB.prepare("DELETE FROM message_tracking WHERE updated_at < ?")
        .bind(now - MESSAGE_TRACKING_RETENTION_MS)
        .run();
      removed += messages.meta?.changes ?? 0;
      if (removed > 0) log.info({ removed }, "Pruned D1 storage rows");
      return { result: "ok", removed };
    } catch (err) {
      log.error({ err }, "Storage prune from cron failed");
      return { result: "error" };
    }
  },
});
