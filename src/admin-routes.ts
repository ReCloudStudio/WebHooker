import { Hono } from "hono";
import type { Env, Route, Group } from "./types";
import { loadRoutes, saveRoutes } from "./config";
import {
  getAdminSession,
  destroyAdminSession,
  clearAdminCookie,
  type AdminSession,
} from "./admin-session";
import {
  loadGroups,
  saveGroups,
  resolveScope,
  hasAnyAccess,
  type AccessScope,
} from "./groups";
import { getSendLog } from "./send-log";
import { log } from "./log";

const VALID_FILTER_TYPES = new Set(["event", "repo", "actor", "action", "branch", "keyword"]);
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function isValidMatch(match: unknown): match is string | string[] {
  if (typeof match === "string") return match.trim().length > 0;
  if (Array.isArray(match))
    return match.length > 0 && match.every((m) => typeof m === "string" && m.trim().length > 0);
  return false;
}

function validateRoutes(
  routes: unknown,
): { ok: true; routes: Route[] } | { ok: false; error: string } {
  if (!Array.isArray(routes)) return { ok: false, error: "routes must be an array" };
  if (routes.length > 200) return { ok: false, error: "too many routes" };

  const seen = new Set<string>();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i] as Record<string, unknown>;
    if (!r || typeof r !== "object") return { ok: false, error: `route[${i}] is not an object` };
    if (typeof r.id !== "string" || !ID_RE.test(r.id)) {
      return { ok: false, error: `route[${i}].id is invalid` };
    }
    if (seen.has(r.id)) return { ok: false, error: `duplicate route id "${r.id}"` };
    seen.add(r.id);
    if (typeof r.name !== "string" || r.name.trim().length === 0) {
      return { ok: false, error: `route "${r.id}" needs a name` };
    }
    if (typeof r.groupId !== "string" || r.groupId.trim().length === 0) {
      return { ok: false, error: `route "${r.id}" needs a group` };
    }
    if (typeof r.enabled !== "boolean")
      return { ok: false, error: `route "${r.id}".enabled must be boolean` };
    if (r.lang !== undefined && typeof r.lang !== "string") {
      return { ok: false, error: `route "${r.id}".lang must be a string` };
    }
    if (!Array.isArray(r.filters) || r.filters.length === 0) {
      return { ok: false, error: `route "${r.id}" needs at least one filter` };
    }
    for (let j = 0; j < r.filters.length; j++) {
      const f = r.filters[j] as Record<string, unknown>;
      if (!f || typeof f !== "object")
        return { ok: false, error: `route "${r.id}" filter[${j}] invalid` };
      if (!VALID_FILTER_TYPES.has(f.type as string)) {
        return { ok: false, error: `route "${r.id}" filter[${j}] has unknown type` };
      }
      if (!isValidMatch(f.match)) {
        return { ok: false, error: `route "${r.id}" filter[${j}] needs a match value` };
      }
      if (f.exclude !== undefined && typeof f.exclude !== "boolean") {
        return { ok: false, error: `route "${r.id}" filter[${j}].exclude must be boolean` };
      }
    }
    const target = r.target as Record<string, unknown> | undefined;
    if (!target || typeof target !== "object")
      return { ok: false, error: `route "${r.id}" needs a target` };
    if (typeof target.channelId !== "string" || target.channelId.trim().length === 0)
      return { ok: false, error: `route "${r.id}".target.channelId is required` };
    if (target.threadId !== undefined && typeof target.threadId !== "string") {
      return { ok: false, error: `route "${r.id}".target.threadId must be a string` };
    }
  }
  return { ok: true, routes: routes as Route[] };
}

function validateGroups(
  groups: unknown,
): { ok: true; groups: Group[] } | { ok: false; error: string } {
  if (!Array.isArray(groups)) return { ok: false, error: "groups must be an array" };
  if (groups.length > 100) return { ok: false, error: "too many groups" };

  const seen = new Set<string>();
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i] as Record<string, unknown>;
    if (!g || typeof g !== "object") return { ok: false, error: `group[${i}] is not an object` };
    if (typeof g.id !== "string" || !ID_RE.test(g.id)) {
      return { ok: false, error: `group[${i}].id is invalid` };
    }
    if (seen.has(g.id)) return { ok: false, error: `duplicate group id "${g.id}"` };
    seen.add(g.id);
    if (typeof g.name !== "string" || g.name.trim().length === 0) {
      return { ok: false, error: `group "${g.id}" needs a name` };
    }
    if (
      !Array.isArray(g.adminIds) ||
      !g.adminIds.every((a) => typeof a === "string" && a.trim().length > 0)
    ) {
      return { ok: false, error: `group "${g.id}".adminIds must be a list of strings` };
    }
    if (
      g.owners !== undefined &&
      (!Array.isArray(g.owners) ||
        !g.owners.every((o) => typeof o === "string" && o.trim().length > 0))
    ) {
      return { ok: false, error: `group "${g.id}".owners must be a list of strings` };
    }
  }
  return { ok: true, groups: groups as Group[] };
}

export function createAdminRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  async function loadScope(c: {
    env: Env;
    req: { header: (name: string) => string | undefined };
  }): Promise<{ session: AdminSession; scope: AccessScope; groups: Group[] } | null> {
    const session = await getAdminSession(c.env.KV, c.req.header("cookie"));
    if (!session) return null;
    const groups = await loadGroups(c.env.KV);
    const scope = resolveScope(c.env, groups, session.userId, session.login);
    if (!hasAnyAccess(scope)) return null;
    return { session, scope, groups };
  }

  app.get("/login", (c) => {
    return c.redirect("/auth/github?redirect=/admin");
  });

  app.get("/logout", async (c) => {
    await destroyAdminSession(c.env.KV, c.req.header("cookie"));
    c.header("Set-Cookie", clearAdminCookie());
    return c.redirect("/admin");
  });

  app.get("/api/me", async (c) => {
    const s = await loadScope(c);
    if (!s) return c.json({ error: "Unauthorized" }, 401);
    return c.json({
      login: s.session.login,
      userId: s.session.userId,
      isSuper: s.scope.isSuper,
      groups: s.scope.groups,
    });
  });

  app.get("/api/groups", async (c) => {
    const s = await loadScope(c);
    if (!s) return c.json({ error: "Unauthorized" }, 401);
    return c.json({ groups: s.scope.groups, isSuper: s.scope.isSuper });
  });

  app.put("/api/groups", async (c) => {
    const s = await loadScope(c);
    if (!s) return c.json({ error: "Unauthorized" }, 401);
    if (!s.scope.isSuper) return c.json({ error: "Forbidden" }, 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const result = validateGroups((body as { groups?: unknown })?.groups);
    if (!result.ok) return c.json({ error: result.error }, 400);
    try {
      await saveGroups(c.env.KV, result.groups);
    } catch (err) {
      log.error({ err }, "Failed to save groups");
      return c.json({ error: "Failed to save groups" }, 500);
    }
    log.info({ count: result.groups.length }, "Groups updated via admin UI");
    return c.json({ ok: true, count: result.groups.length });
  });

  app.get("/api/routes", async (c) => {
    const s = await loadScope(c);
    if (!s) return c.json({ error: "Unauthorized" }, 401);
    const all = await loadRoutes(c.env.KV);
    const routes = s.scope.isSuper
      ? all
      : all.filter((r) => r.groupId != null && s.scope.groupIds.has(r.groupId));
    return c.json({ routes });
  });

  app.get("/api/logs", async (c) => {
    const s = await loadScope(c);
    if (!s) return c.json({ error: "Unauthorized" }, 401);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
    if (s.scope.isSuper) {
      return c.json({ logs: await getSendLog(c.env.KV, limit) });
    }
    const all = await loadRoutes(c.env.KV);
    const allowed = new Set(
      all.filter((r) => r.groupId != null && s.scope.groupIds.has(r.groupId)).map((r) => r.id),
    );
    const logs = (await getSendLog(c.env.KV, 200))
      .filter((l) => allowed.has(l.routeId))
      .slice(0, limit);
    return c.json({ logs });
  });

  app.put("/api/routes", async (c) => {
    const s = await loadScope(c);
    if (!s) return c.json({ error: "Unauthorized" }, 401);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const result = validateRoutes((body as { routes?: unknown })?.routes);
    if (!result.ok) return c.json({ error: result.error }, 400);

    const existing = await loadRoutes(c.env.KV);
    let nextAll: Route[];

    if (s.scope.isSuper) {
      // Super admins see and submit every route: full replace.
      nextAll = result.routes;
    } else {
      // Group admins may only write routes inside their own groups. Reject any
      // submitted route that targets a group they do not manage, then splice
      // their groups' routes in place while preserving all other groups' routes.
      const writable = s.scope.groupIds;
      for (const r of result.routes) {
        if (!r.groupId || !writable.has(r.groupId)) {
          return c.json({ error: `route "${r.id}" is outside your groups` }, 403);
        }
      }
      nextAll = [
        ...existing.filter((r) => !(r.groupId != null && writable.has(r.groupId))),
        ...result.routes,
      ];
    }

    // Guard against duplicate ids across the merged set.
    const ids = new Set<string>();
    for (const r of nextAll) {
      if (ids.has(r.id)) return c.json({ error: `duplicate route id "${r.id}"` }, 400);
      ids.add(r.id);
    }

    try {
      await saveRoutes(c.env.KV, nextAll);
    } catch (err) {
      log.error({ err }, "Failed to save routes");
      return c.json({ error: "Failed to save routes" }, 500);
    }
    log.info({ count: nextAll.length }, "Routes updated via admin UI");
    return c.json({ ok: true, count: nextAll.length });
  });

  return app;
}
