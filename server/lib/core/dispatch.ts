import type { Config, WebhookEvent, Env, Route, Group, NeutralMessage } from "../types";
import { formatEvent } from "../formatters";
import { emojiPrefix, forgeInfo } from "../formatters/helpers";
import { matchRoute, eventOwners } from "../events/match";
import { log } from "../lib/log";
import { loadTranslations, t as translate, type Translations } from "../lib/i18n";
import { recordSend } from "../lib/send-log";
import {
  loadGroups,
  groupAcceptsOwners,
  groupAcceptsProvider,
  groupAcceptsInstallation,
} from "../web/groups";
import { getDriver } from "../drivers";
import type { SendResult } from "../drivers/types";

/** One dispatch attempt (route × target), collected for the group webhook log. */
interface DispatchAttempt {
  groupId?: string;
  routeId: string;
  routeName: string;
  target: string;
  ok: boolean;
  error?: string;
}

export async function dispatchEvent(
  config: Config,
  event: WebhookEvent,
  env: Env,
  groups?: Group[],
): Promise<void> {
  const loadedGroups = groups ?? (await loadGroups(env.KV));
  const groupById = new Map(loadedGroups.map((g) => [g.id, g]));

  // Message language is configured per group (Group.lang), not per route.
  const langs = [...new Set(loadedGroups.map((g) => g.lang ?? "en"))];
  const trMap = new Map<string, Translations>();
  await Promise.all(
    langs.map(async (lang) => {
      trMap.set(lang, await loadTranslations(lang, env.KV));
    }),
  );

  const owners = eventOwners(event);

  const accepted = (route: Route): boolean => {
    if (!route.groupId) return true;
    const group = groupById.get(route.groupId);
    if (!group) return true;
    if (!groupAcceptsInstallation(group, event.installationId)) return false;
    if (!groupAcceptsOwners(group, owners)) return false;
    return groupAcceptsProvider(group, event.provider);
  };
  const matched = config.routes.filter(
    (route) => !route.fallback && matchRoute(route, event) && accepted(route),
  );
  const anyRegularMatched = matched.length > 0;

  const attempts: DispatchAttempt[] = [];
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

  await sendGroupLogs(attempts);

  async function sendGroupLogs(list: DispatchAttempt[]): Promise<void> {
    const byGroup = new Map<string, DispatchAttempt[]>();
    for (const a of list) {
      if (!a.groupId) continue;
      const bucket = byGroup.get(a.groupId);
      if (bucket) bucket.push(a);
      else byGroup.set(a.groupId, [a]);
    }
    for (const [groupId, entries] of byGroup) {
      const group = groupById.get(groupId);
      const target = group?.logTarget;
      if (!group || !target) continue;
      const tr = trMap.get(group.lang ?? "en")!;
      try {
        const allOk = entries.every((a) => a.ok);
        const routeLines = entries
          .slice(0, 10)
          .map((a) =>
            a.ok
              ? emojiPrefix("✅", true) +
                translate("log.route_ok", { route: a.routeName, target: a.target }, undefined, tr)
              : emojiPrefix("❌", true) +
                translate(
                  "log.route_fail",
                  { route: a.routeName, target: a.target, error: a.error ?? "?" },
                  undefined,
                  tr,
                ),
          );
        if (entries.length > 10) routeLines.push(`… +${entries.length - 10}`);
        const message: NeutralMessage = {
          title: translate(
            "log.title",
            {
              repo:
                (event.payload.repository as { full_name?: string } | undefined)?.full_name ?? "-",
              event: event.event,
              action: event.payload.action ? `: ${String(event.payload.action)}` : "",
            },
            undefined,
            tr,
          ),
          color: allOk ? 0x3fb950 : 0xf85149,
          fields: [
            {
              name: translate("log.routes", {}, undefined, tr),
              value: routeLines.join("\n"),
              inline: false,
            },
            {
              name: translate("log.delivery", {}, undefined, tr),
              value: event.deliveryId ?? "-",
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        };
        const result = await getDriver(target).send(message, target, env);
        if (!result.ok) {
          log.warn({ groupId, error: result.error }, "Failed to send group webhook log");
        }
      } catch (err) {
        log.error({ groupId, err }, "Group webhook log send failed");
      }
    }
  }

  async function processRoute(route: Route): Promise<void> {
    const targets = route.targets && route.targets.length > 0 ? route.targets : [];
    if (targets.length === 0) return;

    const group = route.groupId ? groupById.get(route.groupId) : undefined;
    const tr = trMap.get(group?.lang ?? "en")!;
    const showEmoji = group?.emoji !== false;
    const message = formatEvent(route, event, tr, showEmoji);
    if (group?.forgeSources?.length) {
      message.forge = forgeInfo(event, group.forgeSources);
    }
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
              attempts.push({
                groupId: route.groupId,
                routeId: route.id,
                routeName: route.name,
                target: targetStr,
                ok: true,
              });
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
              attempts.push({
                groupId: route.groupId,
                routeId: route.id,
                routeName: route.name,
                target: targetStr,
                ok: true,
              });
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
        attempts.push({
          groupId: route.groupId,
          routeId: route.id,
          routeName: route.name,
          target: targetStr,
          ok: true,
        });
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
        const error = err instanceof Error ? err.message : String(err);
        attempts.push({
          groupId: route.groupId,
          routeId: route.id,
          routeName: route.name,
          target: targetStr,
          ok: false,
          error,
        });
        await recordSend(env.DB, {
          ...base,
          ok: false,
          error,
          durationMs,
        });
        log.error({ routeId: route.id, target: targetStr, err }, "Route failed");
      }
    }
  }
}
