import { createServer } from "./server";
import { syncCommands } from "./discord-interactions";
import type { Env } from "./types";
import { log } from "./log";

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
  },
};
