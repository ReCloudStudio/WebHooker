import type { Env } from "../lib/types";
import { handleQueueBatch } from "../lib/queue/consumer";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:queue", async ({ batch, env }) => {
    await handleQueueBatch(batch, env as Env);
  });
});
