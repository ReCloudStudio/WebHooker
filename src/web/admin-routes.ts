import { Hono } from "hono";
import type { Route, Group, GroupMember, GroupRole } from "../types";
import { loadRoutes, saveRoutes } from "../config";
import { getAdminSession, destroyAdminSession, clearAdminCookie } from "./session";
import { saveGroups, loadGroups, identityMatches, normalizeGroupMembers } from "./groups";
import {
  sessionMiddleware,
  requireAnyAccess,
  currentAuth,
  requireGroup,
  requireGroupRole,
  roleAt,
  clientIp,
  type AuthEnv,
} from "./auth";
import { getSendLog, getSendLogById } from "../lib/send-log";
import { getAuditLog, recordAudit } from "../lib/audit";
import { createInvite, listInvites, revokeInvite, getInvite, acceptInvite } from "./invites";
import { log } from "../lib/log";

const VALID_FILTER_TYPES = new Set(["event", "repo", "actor", "action", "branch", "keyword"]);
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function isValidMatch(match: unknown): match is string | string[] {
  if (typeof match === "string") return match.trim().length > 0;
  if (Array.isArray(match))
    return match.length > 0 && match.every((m) => typeof m === "string" && m.trim().length > 0);
  return false;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
  }
  return false;
}

/**
 * Validates the submitted routes. Routes that are byte-for-byte identical to an
 * entry in `unchanged` (keyed by id) skip the full content check, so a pre-existing
 * incomplete route can never block edits to a different route. Only new or modified
 * routes are fully validated. Structural checks (id shape, uniqueness) still run for all.
 */
function validateRoutes(
  routes: unknown,
  unchanged?: Map<string, Route>,
): { ok: true; routes: Route[] } | { ok: false; error: string } {
  if (!Array.isArray(routes)) return { ok: false, error: "routes must be an array" };
  if (routes.length > 200) return { ok: false, error: "too many routes" };

  const seenByGroup = new Map<string, Set<string>>();
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i] as Record<string, unknown>;
    if (!r || typeof r !== "object") return { ok: false, error: `route[${i}] is not an object` };
    if (typeof r.id !== "string" || !ID_RE.test(r.id)) {
      return { ok: false, error: `route[${i}].id is invalid` };
    }
    const gid = (r.groupId as string) ?? "__nogroup__";
    let groupSeen = seenByGroup.get(gid);
    if (!groupSeen) {
      groupSeen = new Set();
      seenByGroup.set(gid, groupSeen);
    }
    if (groupSeen.has(r.id)) {
      return { ok: false, error: `duplicate route id "${r.id}" in group "${gid}"` };
    }
    groupSeen.add(r.id);
    // Skip full validation for routes that are unchanged from what is stored.
    const prev = unchanged?.get(r.id);
    if (prev && deepEqual(r, prev)) continue;
    if (typeof r.name !== "string" || r.name.trim().length === 0) {
      return { ok: false, error: `route "${r.id}" needs a name` };
    }
    if (typeof r.groupId !== "string" || r.groupId.trim().length === 0) {
      return { ok: false, error: `route "${r.id}" needs a group` };
    }
    if (typeof r.enabled !== "boolean")
      return { ok: false, error: `route "${r.id}".enabled must be boolean` };
    if (r.fallback !== undefined && typeof r.fallback !== "boolean") {
      return { ok: false, error: `route "${r.id}".fallback must be a boolean` };
    }
    if (r.stop !== undefined && typeof r.stop !== "boolean") {
      return { ok: false, error: `route "${r.id}".stop must be a boolean` };
    }
    if (
      r.discordRoleIds !== undefined &&
      (!Array.isArray(r.discordRoleIds) ||
        !r.discordRoleIds.every((d) => typeof d === "string" && d.trim().length > 0))
    ) {
      return { ok: false, error: `route "${r.id}".discordRoleIds must be a list of strings` };
    }
    if (!Array.isArray(r.filters)) {
      return { ok: false, error: `route "${r.id}".filters must be an array` };
    }
    if (r.fallback !== true && r.filters.length === 0) {
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
    const rawTarget = r.target as Record<string, unknown> | undefined;
    const rawTargets = r.targets as unknown;
    if (rawTargets === undefined && rawTarget && typeof rawTarget === "object") {
      const legacy = validateTarget(r, rawTarget);
      if (!legacy.ok) return legacy;
      (r as Record<string, unknown>).targets = [legacy.target];
      delete (r as Record<string, unknown>).target;
    } else if (Array.isArray(rawTargets)) {
      if (rawTargets.length === 0) {
        return { ok: false, error: `route "${r.id}" needs at least one target` };
      }
      const normalized: Route["targets"] = [];
      for (let j = 0; j < rawTargets.length; j++) {
        const t = rawTargets[j] as Record<string, unknown>;
        if (!t || typeof t !== "object") {
          return { ok: false, error: `route "${r.id}".targets[${j}] is not an object` };
        }
        const result = validateTarget(r, t);
        if (!result.ok) return result;
        normalized.push(result.target);
      }
      (r as Record<string, unknown>).targets = normalized;
    } else {
      return { ok: false, error: `route "${r.id}" needs a targets array` };
    }
  }
  return { ok: true, routes: routes as Route[] };
}

function validateTarget(
  r: Record<string, unknown>,
  target: Record<string, unknown>,
): { ok: true; target: Route["targets"][number] } | { ok: false; error: string } {
  const platform = target.platform === undefined ? "discord" : target.platform;
  if (platform !== "discord" && platform !== "telegram") {
    return { ok: false, error: `route "${r.id}".target.platform must be "discord" or "telegram"` };
  }
  if (platform === "telegram") {
    if (typeof target.chatId !== "string" || target.chatId.trim().length === 0)
      return { ok: false, error: `route "${r.id}".target.chatId is required` };
    if (target.topicId !== undefined && typeof target.topicId !== "string") {
      return { ok: false, error: `route "${r.id}".target.topicId must be a string` };
    }
  } else {
    if (typeof target.channelId !== "string" || target.channelId.trim().length === 0)
      return { ok: false, error: `route "${r.id}".target.channelId is required` };
    if (target.threadId !== undefined && typeof target.threadId !== "string") {
      return { ok: false, error: `route "${r.id}".target.threadId must be a string` };
    }
  }
  return {
    ok: true,
    target: {
      platform,
      channelId: platform === "telegram" ? undefined : (target.channelId as string),
      threadId: platform === "telegram" ? undefined : ((target.threadId as string) ?? undefined),
      chatId: platform === "telegram" ? (target.chatId as string) : undefined,
      topicId: platform === "telegram" ? ((target.topicId as string) ?? undefined) : undefined,
    },
  };
}

function validateMembers(
  g: Record<string, unknown>,
  gid: string,
): { ok: true; members: GroupMember[] } | { ok: false; error: string } {
  const raw = g.members;
  if (raw === undefined || raw === null) {
    // Legacy payload without members: derive owners from adminIds.
    const adminIds = g.adminIds;
    if (!Array.isArray(adminIds)) {
      return { ok: false, error: `group "${gid}" needs a members list` };
    }
    if (!adminIds.every((a) => typeof a === "string" && a.trim().length > 0)) {
      return { ok: false, error: `group "${gid}".adminIds must be a list of strings` };
    }
    const members: GroupMember[] = [];
    const seen = new Set<string>();
    for (const a of adminIds as string[]) {
      const login = a.trim();
      if (!login || seen.has(login.toLowerCase())) continue;
      seen.add(login.toLowerCase());
      members.push({ login, role: "owner" });
    }
    return { ok: true, members };
  }
  if (!Array.isArray(raw)) return { ok: false, error: `group "${gid}".members must be an array` };
  const seen = new Set<string>();
  const members: GroupMember[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i] as Record<string, unknown>;
    if (!m || typeof m !== "object")
      return { ok: false, error: `group "${gid}".members[${i}] is not an object` };
    const login = typeof m.login === "string" ? m.login.trim() : "";
    if (!login) return { ok: false, error: `group "${gid}".members[${i}].login is required` };
    const role = m.role;
    if (role !== "owner" && role !== "admin" && role !== "viewer") {
      return {
        ok: false,
        error: `group "${gid}".members[${i}].role must be "owner" | "admin" | "viewer"`,
      };
    }
    if (seen.has(login.toLowerCase())) {
      return { ok: false, error: `group "${gid}" has duplicate member "${login}"` };
    }
    seen.add(login.toLowerCase());
    members.push({ login, role });
  }
  if (members.length > 0 && !members.some((m) => m.role === "owner")) {
    return { ok: false, error: `group "${gid}" needs at least one owner` };
  }
  return { ok: true, members };
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
    const mres = validateMembers(g, g.id);
    if (!mres.ok) return mres;
    // `members` is the single source of truth; adminIds stays in sync so
    // legacy consumers (isGroupAdmin, older UI) keep working.
    g.members = mres.members;
    g.adminIds = mres.members.filter((m) => m.role === "owner").map((m) => m.login);
    if (
      g.owners !== undefined &&
      (!Array.isArray(g.owners) ||
        !g.owners.every((o) => typeof o === "string" && o.trim().length > 0))
    ) {
      return { ok: false, error: `group "${g.id}".owners must be a list of strings` };
    }
    if (
      g.providers !== undefined &&
      (!Array.isArray(g.providers) ||
        !g.providers.every(
          (p) => typeof p === "string" && ["github", "gitea", "gitlab"].includes(p),
        ))
    ) {
      return {
        ok: false,
        error: `group "${g.id}".providers must be a list of "github" | "gitea" | "gitlab"`,
      };
    }
    if (g.emoji !== undefined && typeof g.emoji !== "boolean") {
      return { ok: false, error: `group "${g.id}".emoji must be a boolean` };
    }
    if (g.lang !== undefined && typeof g.lang !== "string") {
      return { ok: false, error: `group "${g.id}".lang must be a string` };
    }
  }
  return { ok: true, groups: groups as Group[] };
}

function ownerCount(members: GroupMember[]): number {
  return members.filter((m) => m.role === "owner").length;
}

/** Route params are always present for matched paths; keeps Hono's loose typing honest. */
function param(
  c: { req: { param: (name: string) => string | undefined } },
  name: string,
): string {
  return c.req.param(name) ?? "";
}

export function createAdminRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  app.get("/login", (c) => {
    return c.redirect("/auth/github?redirect=/admin");
  });

  app.get("/logout", async (c) => {
    const session = await getAdminSession(c.env.KV, c.req.header("cookie"));
    if (session) {
      await recordAudit(c.env.DB, {
        ts: Date.now(),
        actorId: session.userId,
        actorLogin: session.login,
        action: "session.logout",
        ip: clientIp(c),
      });
    }
    await destroyAdminSession(c.env.KV, c.req.header("cookie"));
    c.header("Set-Cookie", clearAdminCookie());
    return c.redirect("/admin");
  });

  // Browser page that accepts a group invite. Not logged in �?OAuth first,
  // carrying the same invite URL as the redirect target.
  app.get("/invite", sessionMiddleware(), async (c) => {
    const token = c.req.query("token");
    if (!token) return c.redirect("/admin");
    const auth = c.get("auth");
    if (!auth) {
      return c.redirect(`/auth/github?redirect=${encodeURIComponent(`/admin/invite?token=${token}`)}`);
    }
    const result = await acceptInvite(c.env.KV, token, auth.session.userId, auth.session.login);
    if (result.ok) {
      await recordAudit(c.env.DB, {
        ts: Date.now(),
        actorId: auth.session.userId,
        actorLogin: auth.session.login,
        action: "invite.accept",
        targetType: "group",
        targetId: result.groupId,
        groupId: result.groupId,
        detail: { role: result.role },
        ip: clientIp(c),
      });
    }
    return c.redirect(`/admin?invite=${result.ok ? "ok" : result.reason}`);
  });

  app.get("/api/me", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    const roles: Record<string, GroupRole> = {};
    for (const g of auth.scope.groups) {
      const role = roleAt(auth.scope, g.id);
      if (role) roles[g.id] = role;
    }
    return c.json({
      login: auth.session.login,
      userId: auth.session.userId,
      isSuper: auth.scope.isSuper,
      groups: auth.scope.groups,
      roles,
    });
  });

  app.get("/api/groups", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    const roles: Record<string, GroupRole> = {};
    for (const g of auth.scope.groups) {
      const role = roleAt(auth.scope, g.id);
      if (role) roles[g.id] = role;
    }
    return c.json({ groups: auth.scope.groups, isSuper: auth.scope.isSuper, roles });
  });

  app.put("/api/groups", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const result = validateGroups((body as { groups?: unknown })?.groups);
    if (!result.ok) return c.json({ error: result.error }, 400);

    const existing = await loadGroups(c.env.KV);
    const prevById = new Map(existing.map((g) => [g.id, g]));
    let nextAll: Group[];

    if (auth.scope.isSuper) {
      // Super admins see and submit every group: full replace.
      nextAll = result.groups;
    } else {
      // Owners may only write groups they own. Preserve every other group and
      // never let a submission drop the last owner of a group.
      const mine = new Set<string>();
      for (const [gid, role] of auth.scope.roles) {
        if (role === "owner") mine.add(gid);
      }
      for (const g of result.groups) {
        if (!mine.has(g.id)) {
          return c.json({ error: `group "${g.id}" is outside your ownership` }, 403);
        }
        const members = g.members ?? normalizeGroupMembers(g);
        const stillMine = members.some(
          (m) =>
            m.role === "owner" &&
            identityMatches([m.login], auth.session.userId, auth.session.login),
        );
        const otherOwner = ownerCount(members) > 1;
        if (!stillMine && !otherOwner) {
          return c.json(
            { error: `group "${g.id}" would be left without an owner by you` },
            403,
          );
        }
      }
      nextAll = [
        ...existing.filter((g) => !mine.has(g.id)),
        ...result.groups.map((g) => {
          const prev = prevById.get(g.id);
          if (prev && prev.owners !== undefined && g.owners === undefined) {
            // Owners cannot edit the `owners` scope; keep the stored value.
            return { ...g, owners: prev.owners };
          }
          return g;
        }),
      ];
    }

    // Audit every create / update / delete.
    const prevGroups = existing;
    const nextById = new Map(nextAll.map((g) => [g.id, g]));
    const actor = { actorId: auth.session.userId, actorLogin: auth.session.login };
    for (const g of nextAll) {
      const prev = prevById.get(g.id);
      if (!prev) {
        await recordAudit(c.env.DB, {
          ts: Date.now(),
          ...actor,
          action: "group.create",
          targetType: "group",
          targetId: g.id,
          groupId: g.id,
          ip: clientIp(c),
        });
        continue;
      }
      const fields: string[] = [];
      if (prev.name !== g.name) fields.push("name");
      if (prev.emoji !== g.emoji) fields.push("emoji");
      if (!deepEqual(prev.providers ?? [], g.providers ?? [])) fields.push("providers");
      if (!deepEqual(prev.owners ?? [], g.owners ?? [])) fields.push("owners");
      if (!deepEqual(prev.members ?? normalizeGroupMembers(prev), g.members)) fields.push("members");
      if (fields.length > 0) {
        await recordAudit(c.env.DB, {
          ts: Date.now(),
          ...actor,
          action: "group.update",
          targetType: "group",
          targetId: g.id,
          groupId: g.id,
          detail: { fields },
          ip: clientIp(c),
        });
      }
    }
    for (const g of prevGroups) {
      if (!nextById.has(g.id)) {
        await recordAudit(c.env.DB, {
          ts: Date.now(),
          ...actor,
          action: "group.delete",
          targetType: "group",
          targetId: g.id,
          groupId: g.id,
          ip: clientIp(c),
        });
      }
    }

    try {
      await saveGroups(c.env.KV, nextAll);
    } catch (err) {
      log.error({ err }, "Failed to save groups");
      return c.json({ error: "Failed to save groups" }, 500);
    }
    log.info({ count: nextAll.length }, "Groups updated via admin UI");
    return c.json({ ok: true, count: nextAll.length });
  });

  app.get("/api/routes", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    const all = await loadRoutes(c.env.KV);
    const routes = auth.scope.isSuper
      ? all
      : all.filter((r) => r.groupId != null && auth.scope.groupIds.has(r.groupId));
    return c.json({ routes });
  });

  app.put("/api/routes", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const existing = await loadRoutes(c.env.KV);
    const unchanged = new Map(existing.map((r) => [r.id, r]));
    const result = validateRoutes((body as { routes?: unknown })?.routes, unchanged);
    if (!result.ok) return c.json({ error: result.error }, 400);

    let nextAll: Route[];

    if (auth.scope.isSuper) {
      // Super admins see and submit every route: full replace.
      nextAll = result.routes;
    } else {
      // Owners and admins may only write routes inside groups they manage.
      // Reject any submitted route that targets a group they cannot edit,
      // then splice their groups' routes in place while preserving all others.
      const writable = new Set<string>();
      for (const [gid, role] of auth.scope.roles) {
        if (role === "owner" || role === "admin") writable.add(gid);
      }
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

    try {
      await saveRoutes(c.env.KV, nextAll);
    } catch (err) {
      log.error({ err }, "Failed to save routes");
      return c.json({ error: "Failed to save routes" }, 500);
    }
    await recordAudit(c.env.DB, {
      ts: Date.now(),
      actorId: auth.session.userId,
      actorLogin: auth.session.login,
      action: "routes.update",
      targetType: "routes",
      targetId: "all",
      detail: { count: nextAll.length },
      ip: clientIp(c),
    });
    log.info({ count: nextAll.length }, "Routes updated via admin UI");
    return c.json({ ok: true, count: nextAll.length });
  });

  app.get("/api/logs", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
    const filterGroupId = c.req.query("groupId") || undefined;
    const allLogs = await getSendLog(c.env.DB, 200);
    const allowed = auth.scope.isSuper
      ? allLogs
      : allLogs.filter((l) => l.groupId != null && auth.scope.groupIds.has(l.groupId));
    const logs = filterGroupId ? allowed.filter((l) => l.groupId === filterGroupId) : allowed;
    return c.json({ logs: logs.slice(0, limit) });
  });

  app.get("/api/logs/:id", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    const id = Number(param(c, "id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid log id" }, 400);
    const entry = await getSendLogById(c.env.DB, id);
    if (!entry) return c.json({ error: "Log entry not found" }, 404);
    if (!auth.scope.isSuper) {
      if (!entry.groupId || !auth.scope.groupIds.has(entry.groupId)) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
    return c.json({ log: entry });
  });

  // Routes scoped to a single group. The group is the container: the console
  // enters a group and then lists / edits only that group's routes.
  app.get("/api/groups/:groupId/routes", requireAnyAccess(), async (c) => {
    const groupId = param(c, "groupId");
    const access = requireGroup(c, groupId);
    if (!access.ok) {
      return c.json(
        { error: access.status === 404 ? "Group not found" : "Forbidden" },
        access.status,
      );
    }
    const all = await loadRoutes(c.env.KV);
    return c.json({ group: access.group, routes: all.filter((r) => r.groupId === groupId) });
  });

  app.put("/api/groups/:groupId/routes", requireAnyAccess(), async (c) => {
    const groupId = param(c, "groupId");
    const access = requireGroupRole(c, groupId, "admin");
    if (!access.ok) {
      return c.json(
        { error: access.status === 404 ? "Group not found" : "Forbidden" },
        access.status,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Force every submitted route into this group so the client never has to
    // carry a groupId; the path parameter is the single source of truth.
    const submitted = (body as { routes?: unknown })?.routes;
    const scoped = Array.isArray(submitted)
      ? submitted.map((r) => ({ ...(r as Record<string, unknown>), groupId }))
      : submitted;
    const existing = await loadRoutes(c.env.KV);
    const unchanged = new Map(existing.map((r) => [r.id, r]));
    const result = validateRoutes(scoped, unchanged);
    if (!result.ok) return c.json({ error: result.error }, 400);

    // Replace only this group's routes; every other group is preserved untouched.
    const others = existing.filter((r) => r.groupId !== groupId);
    const nextAll = [...others, ...result.routes];

    try {
      await saveRoutes(c.env.KV, nextAll);
    } catch (err) {
      log.error({ err }, "Failed to save routes");
      return c.json({ error: "Failed to save routes" }, 500);
    }
    const auth = currentAuth(c);
    await recordAudit(c.env.DB, {
      ts: Date.now(),
      actorId: auth.session.userId,
      actorLogin: auth.session.login,
      action: "group.routes.update",
      targetType: "group",
      targetId: groupId,
      groupId,
      detail: { count: result.routes.length },
      ip: clientIp(c),
    });
    log.info({ groupId, count: result.routes.length }, "Group routes updated via admin UI");
    return c.json({ ok: true, count: result.routes.length });
  });

  // ---- Group invites (owner +) ----
  app.post("/api/groups/:groupId/invites", requireAnyAccess(), async (c) => {
    const groupId = param(c, "groupId");
    const access = requireGroupRole(c, groupId, "owner");
    if (!access.ok) {
      return c.json(
        { error: access.status === 404 ? "Group not found" : "Forbidden" },
        access.status,
      );
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const role = (body as { role?: unknown })?.role;
    if (role !== "admin" && role !== "viewer") {
      return c.json({ error: 'role must be "admin" or "viewer"' }, 400);
    }
    const note = (body as { note?: unknown })?.note;
    const auth = currentAuth(c);
    const token = await createInvite(c.env.KV, {
      groupId,
      role,
      expiresAt: Date.now() + 7 * 86400_000,
      createdBy: auth.session.login,
      note: typeof note === "string" && note.trim() ? note.trim() : undefined,
    });
    await recordAudit(c.env.DB, {
      ts: Date.now(),
      actorId: auth.session.userId,
      actorLogin: auth.session.login,
      action: "invite.create",
      targetType: "group",
      targetId: groupId,
      groupId,
      detail: { role },
      ip: clientIp(c),
    });
    return c.json({
      ok: true,
      token,
      url: `/admin/invite?token=${token}`,
      expiresAt: Date.now() + 7 * 86400_000,
    });
  });

  app.get("/api/groups/:groupId/invites", requireAnyAccess(), async (c) => {
    const groupId = param(c, "groupId");
    const access = requireGroupRole(c, groupId, "owner");
    if (!access.ok) {
      return c.json(
        { error: access.status === 404 ? "Group not found" : "Forbidden" },
        access.status,
      );
    }
    const invites = await listInvites(c.env.KV, groupId);
    return c.json({ invites });
  });

  app.delete("/api/invites/:token", requireAnyAccess(), async (c) => {
    const token = param(c, "token");
    const invite = await getInvite(c.env.KV, token);
    if (!invite) return c.json({ error: "Invite not found" }, 404);
    const access = requireGroupRole(c, invite.groupId, "owner");
    if (!access.ok) return c.json({ error: "Forbidden" }, 403);
    await revokeInvite(c.env.KV, token);
    const auth = currentAuth(c);
    await recordAudit(c.env.DB, {
      ts: Date.now(),
      actorId: auth.session.userId,
      actorLogin: auth.session.login,
      action: "invite.revoke",
      targetType: "group",
      targetId: invite.groupId,
      groupId: invite.groupId,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

  // ---- Audit log (any access; group admins see only their groups) ----
  app.get("/api/audit", requireAnyAccess(), async (c) => {
    const auth = currentAuth(c);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);
    const groupId = c.req.query("groupId") || undefined;
    if (groupId && !auth.scope.isSuper && !auth.scope.groupIds.has(groupId)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const entries = await getAuditLog(c.env.DB, { groupId, limit });
    const visible = auth.scope.isSuper
      ? entries
      : entries.filter((e) => e.groupId != null && auth.scope.groupIds.has(e.groupId));
    return c.json({ audit: visible });
  });

  return app;
}
