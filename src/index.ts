import { createServer } from "./server";
import { initGateway } from "./discord";
import { DiscordGateway } from "./discord-gateway";
import type { Env } from "./types";
import { log } from "./log";

export { DiscordGateway };

const app = createServer();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    try {
      await initGateway(env);
    } catch (err) {
      log.error({ err }, "Gateway init from cron failed");
    }
  },
};
