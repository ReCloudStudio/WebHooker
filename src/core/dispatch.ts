import type { Config, WebhookEvent, Env, Route } from "../types";
import { formatEvent } from "../formatters";
import { matchRoute, eventOwners } from "../events/match";
import { log } from "../lib/log";
import { loadTranslations, type Translations } from "../lib/i18n";
import { recordSend } from "../lib/send-log";
import { loadGroups, groupAcceptsOwners } from "../web/groups";
import { getDriver } from "../drivers";

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

  const tasks = config.routes
    .filter((route) => {
      if (!accepted(route)) return false;
      if (route.fallback) return !anyRegularMatched;
      return matchRoute(route, event);
    })
    .map(async (route) => {
      const target = route.target.threadId
        ? `${route.target.channelId}/${route.target.threadId}`
        : route.target.channelId;

      try {
        const tr = trMap.get(route.lang ?? "en")!;
        const group = route.groupId ? groupById.get(route.groupId) : undefined;
        const showEmoji = group?.emoji !== false;
        const message = formatEvent(route, event, tr, showEmoji);
        const result = await getDriver(route.target).send(message, route.target, env);
        if (!result.ok) throw new Error(result.error ?? "Send failed");
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
    });

  await Promise.allSettled(tasks);
}
