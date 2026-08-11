import type { Context } from "hono";
import type { Env, Group, GroupRole } from "../types";
import { getAdminSession, type AdminSession } from "./session";
import {
  loadGroups,
  resolveScope,
  hasAnyAccess,
  canEditGroup,
  canEditRoutes,
  roleAtLeast,
  roleAt,
  type AccessScope,
} from "./groups";
import { findUserIdByToken } from "../github/store";

export interface AuthContext {
  session: AdminSession;
  scope: AccessScope;
  groups: Group[];
}

export type AuthEnv = {
  Bindings: Env;
  Variables: {
    auth: AuthContext;
    userId: string;
  };
};

export const AUTH_KEY = "auth";

async function loadAuth(c: Context<AuthEnv>): Promise<AuthContext | null> {
  const session = await getAdminSession(c.env.KV, c.req.header("cookie"));
  if (!session) return null;
  const groups = await loadGroups(c.env.KV);
  const scope = resolveScope(c.env, groups, session.userId, session.login);
  return { session, scope, groups };
}

/** Populates `auth` whenever a valid session exists (does not reject). */
export function sessionMiddleware() {
  return async (c: Context<AuthEnv>, next: () => Promise<void>): Promise<Response | void> => {
    const auth = await loadAuth(c);
    if (auth) c.set(AUTH_KEY, auth);
    await next();
  };
}

/** 401 when not logged in, 403 when the account has no group access at all. */
export function requireAnyAccess() {
  return async (c: Context<AuthEnv>, next: () => Promise<void>): Promise<Response | void> => {
    const auth = await loadAuth(c);
    if (!auth) return c.json({ error: "Unauthorized" }, 401);
    if (!hasAnyAccess(auth.scope)) return c.json({ error: "Forbidden" }, 403);
    c.set(AUTH_KEY, auth);
    await next();
  };
}

/** The authenticated context; only valid behind an auth middleware. */
export function currentAuth(c: Context<AuthEnv>): AuthContext {
  return c.get(AUTH_KEY);
}

export type GroupAccess = { ok: true; group: Group } | { ok: false; status: 403 | 404 };

/** Resolves the group and checks the user can at least view it. */
export function requireGroup(c: Context<AuthEnv>, groupId: string): GroupAccess {
  const auth = currentAuth(c);
  const group = auth.groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, status: 404 };
  if (!auth.scope.isSuper && !auth.scope.groupIds.has(groupId)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, group };
}

/** Requires at least `min` role in the group (owner|admin|viewer). */
export function requireGroupRole(
  c: Context<AuthEnv>,
  groupId: string,
  min: GroupRole,
): GroupAccess {
  const access = requireGroup(c, groupId);
  if (!access.ok) return access;
  const auth = currentAuth(c);
  if (!auth.scope.isSuper && !roleAtLeast(roleAt(auth.scope, groupId), min)) {
    return { ok: false, status: 403 };
  }
  return access;
}

export { canEditGroup, canEditRoutes, roleAt };

/** Best-effort client IP for audit entries (Cloudflare header first). */
export function clientIp(c: {
  req: { header: (n: string) => string | undefined };
}): string | undefined {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
}

/** Bearer-token auth for machine-to-machine action endpoints. */
export function bearerAuthMiddleware() {
  return async (c: Context<AuthEnv>, next: () => Promise<void>): Promise<Response | void> => {
    const auth = c.req.header("authorization");
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Missing authorization" }, 401);
    const userId = await findUserIdByToken(c.env.KV, auth.slice(7));
    if (!userId) return c.json({ error: "Invalid or expired token" }, 401);
    c.set("userId", userId);
    await next();
  };
}
