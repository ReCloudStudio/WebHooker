import { Hono } from "hono";
import type { Env, Route } from "./types";
import { loadRoutes, saveRoutes } from "./config";
import {
  isAdminUser,
  getAdminSession,
  destroyAdminSession,
  clearAdminCookie,
} from "./admin-session";
import { getSendLog } from "./send-log";
import { log } from "./log";

const VALID_FILTER_TYPES = new Set(["event", "repo", "actor", "action", "branch", "keyword"]);

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
    if (typeof r.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(r.id)) {
      return { ok: false, error: `route[${i}].id is invalid` };
    }
    if (seen.has(r.id)) return { ok: false, error: `duplicate route id "${r.id}"` };
    seen.add(r.id);
    if (typeof r.name !== "string" || r.name.trim().length === 0) {
      return { ok: false, error: `route "${r.id}" needs a name` };
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

export function createAdminRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  async function requireAdmin(c: {
    env: Env;
    req: { header: (name: string) => string | undefined };
  }): Promise<{ userId: string; login: string } | null> {
    const session = await getAdminSession(c.env.KV, c.req.header("cookie"));
    if (!session) return null;
    if (!isAdminUser(c.env, session.userId, session.login)) return null;
    return session;
  }

  app.get("/login", (c) => {
    return c.redirect("/auth/github?redirect=/");
  });

  app.get("/logout", async (c) => {
    await destroyAdminSession(c.env.KV, c.req.header("cookie"));
    c.header("Set-Cookie", clearAdminCookie());
    return c.redirect("/");
  });

  app.get("/api/routes", async (c) => {
    if (!(await requireAdmin(c))) return c.json({ error: "Unauthorized" }, 401);
    const routes = await loadRoutes(c.env.KV);
    return c.json({ routes });
  });

  app.get("/api/logs", async (c) => {
    if (!(await requireAdmin(c))) return c.json({ error: "Unauthorized" }, 401);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
    const logs = await getSendLog(c.env.KV, limit);
    return c.json({ logs });
  });

  app.put("/api/routes", async (c) => {
    if (!(await requireAdmin(c))) return c.json({ error: "Unauthorized" }, 401);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const result = validateRoutes((body as { routes?: unknown })?.routes);
    if (!result.ok) return c.json({ error: result.error }, 400);

    try {
      await saveRoutes(c.env.KV, result.routes);
    } catch (err) {
      log.error({ err }, "Failed to save routes");
      return c.json({ error: "Failed to save routes" }, 500);
    }
    log.info({ count: result.routes.length }, "Routes updated via admin UI");
    return c.json({ ok: true, count: result.routes.length });
  });

  return app;
}
