import type { Config, WebhookEvent, Env, Route } from "../types";
import { formatEvent } from "../formatters";
import { matchRoute, eventOwners } from "../events/match";
import { log } from "../lib/log";
import { loadTranslations, type Translations } from "../lib/i18n";
import { recordSend } from "../lib/send-log";
import { loadGroups, groupAcceptsOwners } from "../web/groups";
import { getDriver } from "../drivers";
import type { SendResult } from "../drivers/types";

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

  const accepted = (route: Route): boolean => {
    if (!route.groupId) return true;
    const group = groupById.get(route.groupId);
    return !group || groupAcceptsOwners(group, owners);
  };
  const matched = config.routes.filter(
    (route) => !route.fallback && matchRoute(route, event) && accepted(route),
  );
  const anyRegularMatched = matched.length > 0;

  const tasks: Promise<void>[] = [];
  for (const route of config.routes) {
    if (!accepted(route)) continue;
    if (route.fallback) {
      if (!anyRegularMatched && matchRoute(route, event)) {
        tasks.push(processRoute(route));
      }
      continue;
    }
    if (matchRoute(route, event)) {
      tasks.push(processRoute(route));
      if (route.stop) break;
    }
  }
  await Promise.allSettled(tasks);

  async function processRoute(route: Route): Promise<void> {
    const targets = route.targets && route.targets.length > 0 ? route.targets : [];
    if (targets.length === 0) return;

    const tr = trMap.get(route.lang ?? "en")!;
    const group = route.groupId ? groupById.get(route.groupId) : undefined;
    const showEmoji = group?.emoji !== false;
    const message = formatEvent(route, event, tr, showEmoji);
    if (route.discordRoleIds?.length) {
      message.mentionRoleIds = route.discordRoleIds;
    }

    for (const target of targets) {
      const targetStr =
        target.platform === "telegram"
          ? target.topicId
            ? `${target.chatId}/${target.topicId}`
            : (target.chatId ?? "")
          : target.threadId
            ? `${target.channelId}/${target.threadId}`
            : (target.channelId ?? "");

      const base: {
        ts: number;
        routeId: string;
        groupId: string | undefined;
        event: string;
        repo: string | undefined;
        target: string;
        deliveryId: string | undefined;
        actor: string | undefined;
        action: string | undefined;
      } = {
        ts: Date.now(),
        routeId: route.id,
        groupId: route.groupId,
        event: event.event,
        repo: (event.payload.repository as { full_name?: string } | undefined)?.full_name,
        target: targetStr,
        deliveryId: event.deliveryId,
        actor: (event.payload.sender as { login?: string } | undefined)?.login,
        action: event.payload.action as string | undefined,
      };

      const started = Date.now();
      try {
        const driver = getDriver(target);
        let result: SendResult;
        if (message.updateKey) {
          const groupPrefix = route.groupId ? `${route.groupId}:` : "";
          const kvKey = `msg:${groupPrefix}${route.id}:${message.updateKey}:${targetStr}`;
          const existingId = await env.KV.get(kvKey);
          if (existingId) {
            result = await driver.edit(message, target, env, existingId);
            if (result.ok) {
              await recordSend(env.DB, {
                ...base,
                ok: true,
                status: result.status,
                messageId: existingId,
                platform: driver.id,
                attempts: result.attempts,
                durationMs: Date.now() - started,
                errorCode: result.errorCode,
              });
              continue;
            }
            if (/not modified/i.test(result.error ?? "")) {
              await recordSend(env.DB, {
                ...base,
                ok: true,
                status: result.status,
                messageId: existingId,
                platform: driver.id,
                attempts: result.attempts,
                durationMs: Date.now() - started,
                errorCode: result.errorCode,
              });
              continue;
            }
            await env.KV.delete(kvKey);
          }
          result = await driver.send(message, target, env);
          if (result.ok && result.messageId) {
            await env.KV.put(kvKey, result.messageId, { expirationTtl: 604800 });
          }
        } else {
          result = await driver.send(message, target, env);
        }
        const durationMs = Date.now() - started;
        if (!result.ok) throw new Error(result.error ?? "Send failed");
        await recordSend(env.DB, {
          ...base,
          ok: true,
          status: result.status,
          messageId: result.messageId,
          platform: driver.id,
          attempts: result.attempts,
          durationMs,
          errorCode: result.errorCode,
        });
      } catch (err) {
        const durationMs = Date.now() - started;
        await recordSend(env.DB, {
          ...base,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs,
        });
        log.error({ routeId: route.id, target: targetStr, err }, "Route failed");
      }
    }
  }
}
