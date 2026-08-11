import { createServer } from "./server";
import { syncCommands } from "./drivers/discord/commands";
import { syncTelegramWebhook } from "./drivers/telegram/commands";
import { pruneAuditLogs } from "./lib/audit";
import type { Env } from "./types";
import { log } from "./lib/log";

const app = createServer();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    try {
      await syncCommands(env);
    } catch (err) {
      log.error({ err }, "Discord command sync from cron failed");
    }
    try {
      await syncTelegramWebhook(env);
    } catch (err) {
      log.error({ err }, "Telegram webhook sync from cron failed");
    }
    try {
      const days = Math.max(Number(env.AUDIT_RETENTION_DAYS ?? 90) || 90, 1);
      const removed = await pruneAuditLogs(env.DB, days);
      if (removed > 0) log.info({ removed }, "Pruned audit logs");
    } catch (err) {
      log.error({ err }, "Audit log prune from cron failed");
    }
  },
};
