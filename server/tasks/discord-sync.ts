import { syncCommands } from "../lib/drivers/discord/commands";
import { cfEnv } from "../lib/cf";
import { log } from "../lib/lib/log";

/** Scheduled: sync Discord application commands (cron every 5 minutes). */
export default defineTask({
  meta: { name: "discord:sync", description: "Sync Discord application commands" },
  async run(event) {
    try {
      await syncCommands(cfEnv(event));
      return { result: "ok" };
    } catch (err) {
      log.error({ err }, "Discord command sync from cron failed");
      return { result: "error" };
    }
  },
});
