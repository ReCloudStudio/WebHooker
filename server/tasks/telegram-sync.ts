import { syncTelegramWebhook } from "../lib/drivers/telegram/commands";
import { cfEnv } from "../lib/cf";
import { log } from "../lib/lib/log";

/** Scheduled: sync the Telegram webhook URL (cron every 5 minutes). */
export default defineTask({
  meta: { name: "telegram:sync", description: "Sync Telegram webhook URL" },
  async run(event) {
    try {
      await syncTelegramWebhook(cfEnv(event));
      return { result: "ok" };
    } catch (err) {
      log.error({ err }, "Telegram webhook sync from cron failed");
      return { result: "error" };
    }
  },
});
