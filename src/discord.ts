import type { Config, FormattedMessage, WebhookEvent, Env } from "./types";
import { formatEvent } from "./formatter";
import { matchRoute } from "./webhook";
import { log } from "./log";
import { loadTranslations } from "./i18n";

async function getGatewayProxy(env: Env): Promise<DurableObjectStub> {
  const id = env.DISCORD_GATEWAY.idFromName("discord-gateway");
  return env.DISCORD_GATEWAY.get(id);
}

export async function initGateway(env: Env): Promise<void> {
  if (!env.DISCORD_TOKEN) return;
  const stub = await getGatewayProxy(env);
  await stub.fetch(
    new Request("https://do.internal", {
      method: "POST",
      body: JSON.stringify({ action: "start", token: env.DISCORD_TOKEN }),
    }),
  );
  log.info("Discord Gateway DO started");
}

export async function dispatchEvent(config: Config, event: WebhookEvent, env: Env): Promise<void> {
  for (const route of config.routes) {
    if (!matchRoute(route, event)) continue;

    try {
      const tr = await loadTranslations(route.lang ?? "en", env.KV);
      const message = formatEvent(route, event, tr);
      await sendWithRetry(route.target.channelId, message, env, route.target.threadId);
    } catch (err) {
      log.error({ routeId: route.id, err }, "Route failed");
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(
  channelId: string,
  message: FormattedMessage,
  env: Env,
  threadId?: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sendToChannel(channelId, message, env, threadId);
      return;
    } catch (err: unknown) {
      const error = err as Record<string, unknown>;
      const isRateLimit = error.code === 50035 || error.status === 429;
      if (isRateLimit && attempt < maxRetries) {
        const retryAfter = ((error.retry_after as number) ?? (attempt + 1) * 2) as number;
        log.warn({ retryAfter, attempt, maxRetries }, "Rate limited, retrying");
        await sleep(retryAfter * 1000);
        continue;
      }
      throw err;
    }
  }
}

async function sendToChannel(
  channelId: string,
  message: FormattedMessage,
  env: Env,
  threadId?: string,
): Promise<void> {
  const stub = await getGatewayProxy(env);
  const res = await stub.fetch(
    new Request("https://do.internal", {
      method: "POST",
      body: JSON.stringify({ action: "send", channelId, message, threadId }),
    }),
  );
  const result = (await res.json()) as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(result.error ?? "Send failed");
  }
}
