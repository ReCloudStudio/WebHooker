import type { Config, FormattedMessage, WebhookEvent, Env } from "./types";
import { formatEvent } from "./formatter";
import { matchRoute, eventOwners } from "./webhook";
import { log } from "./log";
import { loadTranslations, type Translations } from "./i18n";
import { sendMessage } from "./discord-rest";
import { recordSend } from "./send-log";
import { loadGroups, groupAcceptsOwners } from "./groups";

export function isGatewayEnabled(env: Env): boolean {
  return env.DISCORD_GATEWAY_ENABLED === "true";
}

async function getGatewayProxy(env: Env): Promise<DurableObjectStub> {
  const id = env.DISCORD_GATEWAY.idFromName("discord-gateway");
  return env.DISCORD_GATEWAY.get(id);
}

export async function initGateway(env: Env): Promise<void> {
  if (!isGatewayEnabled(env)) return;
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
  const langs = [...new Set(config.routes.map((r) => r.lang ?? "en"))];
  const trMap = new Map<string, Translations>();
  await Promise.all(
    langs.map(async (lang) => {
      trMap.set(lang, await loadTranslations(lang, env.KV));
    }),
  );

  const groups = await loadGroups(env.KV);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const owners = eventOwners(event);

  for (const route of config.routes) {
    if (!matchRoute(route, event)) continue;

    if (route.groupId) {
      const group = groupById.get(route.groupId);
      if (group && !groupAcceptsOwners(group, owners)) continue;
    }

    const target = route.target.threadId
      ? `${route.target.channelId}/${route.target.threadId}`
      : route.target.channelId;

    try {
      const tr = trMap.get(route.lang ?? "en")!;
      const message = formatEvent(route, event, tr);
      await sendToChannel(route.target.channelId, message, env, route.target.threadId);
      await recordSend(env.KV, {
        ts: Date.now(),
        routeId: route.id,
        event: event.event,
        repo: (event.payload.repository as { full_name?: string } | undefined)?.full_name,
        target,
        ok: true,
      });
    } catch (err) {
      await recordSend(env.KV, {
        ts: Date.now(),
        routeId: route.id,
        event: event.event,
        repo: (event.payload.repository as { full_name?: string } | undefined)?.full_name,
        target,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      log.error({ routeId: route.id, err }, "Route failed");
    }
  }
}

async function sendToChannel(
  channelId: string,
  message: FormattedMessage,
  env: Env,
  threadId?: string,
): Promise<void> {
  const token = env.DISCORD_TOKEN ?? "";
  if (!isGatewayEnabled(env)) {
    const result = await sendMessage(token, channelId, message, threadId);
    if (!result.ok) throw new Error(result.error ?? "Send failed");
    return;
  }

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
