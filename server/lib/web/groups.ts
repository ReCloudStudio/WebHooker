import type { Env, Group, GroupMember, GroupRole } from "../types";
import { isAdminUser } from "./session";
import { log } from "../lib/log";
import { migrateGroups, validateGroups } from "../config/schema";

const GROUPS_KEY = "config:groups";
const GROUPS_CACHE_TTL = 300_000;
let groupsCache: { groups: Group[]; expiresAt: number } | null = null;

/**
 * Normalizes a group's member list. Groups stored with the legacy `adminIds`
 * field (or with neither field) get their admins as role "owner" members, so
 * every existing group keeps full control after the member-model migration.
 * Never mutates the input; returns a fresh array.
 */
export function normalizeGroupMembers(group: Group): GroupMember[] {
  const members = group.members;
  if (Array.isArray(members) && members.length > 0) {
    const seen = new Set<string>();
    const out: GroupMember[] = [];
    for (const m of members) {
      const login = String(m?.login ?? "").trim();
      if (!login || seen.has(login.toLowerCase())) continue;
      const role: GroupRole = m?.role === "admin" || m?.role === "viewer" ? m.role : "owner";
      seen.add(login.toLowerCase());
      out.push({ login, role });
    }
    return out;
  }
  // Legacy path: adminIds → owners.
  const seen = new Set<string>();
  const out: GroupMember[] = [];
  for (const a of group.adminIds ?? []) {
    const login = a.trim();
    if (!login || seen.has(login.toLowerCase())) continue;
    seen.add(login.toLowerCase());
    out.push({ login, role: "owner" });
  }
  return out;
}

export async function loadGroups(kv: KVNamespace): Promise<Group[]> {
  if (groupsCache && Date.now() < groupsCache.expiresAt) {
    return groupsCache.groups;
  }
  try {
    const stored = await kv.get<Group[]>(GROUPS_KEY, "json");
    const groups = Array.isArray(stored) ? validateGroups(migrateGroups(stored)) : [];
    groupsCache = { groups, expiresAt: Date.now() + GROUPS_CACHE_TTL };
    return groups;
  } catch (err) {
    log.warn({ err }, "Failed to load groups from KV");
  }
  return [];
}

export async function saveGroups(kv: KVNamespace, groups: Group[]): Promise<void> {
  await kv.put(GROUPS_KEY, JSON.stringify(groups));
  groupsCache = null;
}

export function invalidateGroupsCache(): void {
  groupsCache = null;
}

/** Case-insensitive match of a GitHub userId or login against a list of ids/logins. */
export function identityMatches(ids: string[], userId: string, login: string): boolean {
  const wanted = ids.map((s) => s.trim()).filter(Boolean);
  if (wanted.length === 0) return false;
  return wanted.some((id) => id === userId || id.toLowerCase() === login.toLowerCase());
}

export function isGroupAdmin(group: Group, userId: string, login: string): boolean {
  return identityMatches(group.adminIds ?? [], userId, login);
}

/**
 * The user's role in a group, derived from normalized members. Legacy
 * `adminIds` groups resolve to "owner" for every listed admin.
 */
export function memberRole(group: Group, userId: string, login: string): GroupRole | undefined {
  const members = normalizeGroupMembers(group);
  const wanted = members.filter((m) => {
    const candidate = m.login.trim().toLowerCase();
    return candidate === login.toLowerCase() || candidate === userId;
  });
  return wanted.length > 0 ? wanted[0]!.role : undefined;
}

/**
 * Whether an event originating from `owners` (org/user logins) is allowed into
 * this group. A group with no owner restriction accepts everything.
 */
export function groupAcceptsOwners(group: Group, owners: string[]): boolean {
  const restrict = (group.owners ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (restrict.length === 0) return true;
  const seen = owners.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return seen.some((o) => restrict.includes(o));
}

/**
 * Whether an event from a webhook `provider` (source platform: github, gitea,
 * ...) is allowed into this group. A group with no provider restriction
 * accepts every provider. Events without a provider are treated as github.
 */
export function groupAcceptsProvider(group: Group, provider?: string): boolean {
  const allowed = (group.providers ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(provider ?? "github");
}

/**
 * Whether an event from a GitHub App `installationId` is allowed into this
 * group. A group bound to an installation only accepts events from that
 * installation (hard tenant isolation). Unbound groups accept everything here
 * (their access is governed by `owners`/`providers` instead).
 */
export function groupAcceptsInstallation(group: Group, installationId?: number): boolean {
  if (group.installationId == null) return true;
  return installationId != null && group.installationId === installationId;
}

/**
 * Auto-provision a GitHub App installation on `installation.created`:
 * 1. No-op when a group is already bound to this installation id.
 * 2. Otherwise bind every unbound group whose `owners` match the installing
 *    account login (so existing org groups light up automatically).
 * 3. Otherwise create a dedicated `inst-{installationId}` group bound to the
 *    installation. Returns the group that now owns the installation.
 */
export async function ensureInstallationGroup(
  kv: KVNamespace,
  installationId: number,
  accountLogin: string,
): Promise<Group | null> {
  // A per-installation lock serializes concurrent `installation.created`
  // webhooks: without it two requests both pass the "no group bound" check,
  // both create `inst-{id}`, and the second save overwrites the first.
  const lockKey = `inst:lock:${installationId}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const holder = await kv.get(lockKey);
    if (!holder) break;
    const groups = await loadGroups(kv);
    const existing = groups.find((g) => g.installationId === installationId);
    if (existing) return existing;
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }

  let locked = false;
  try {
    await kv.put(lockKey, "1", { expirationTtl: 60 });
    locked = true;

    const groups = await loadGroups(kv);
    const existing = groups.find((g) => g.installationId === installationId);
    if (existing) return existing;

    const login = accountLogin.trim().toLowerCase();
    const candidates = groups.filter(
      (g) =>
        g.installationId == null &&
        login.length > 0 &&
        (g.owners ?? []).some((o) => o.trim().toLowerCase() === login),
    );
    if (candidates.length > 0) {
      const next = groups.map((g) => (candidates.includes(g) ? { ...g, installationId } : g));
      await saveGroups(kv, next);
      return next.find((g) => g.id === candidates[0]!.id) ?? null;
    }

    const gid = `inst-${installationId}`;
    const dedicated = groups.find((g) => g.id === gid);
    const group: Group = {
      id: gid,
      name: accountLogin.trim() || `Installation ${installationId}`,
      adminIds: [],
      installationId,
    };
    await saveGroups(
      kv,
      dedicated ? groups.map((g) => (g.id === gid ? { ...g, ...group } : g)) : [...groups, group],
    );
    return group;
  } finally {
    if (locked) await kv.delete(lockKey);
  }
}

export interface AccessScope {
  isSuper: boolean;
  /** Groups the user may view. When isSuper, this is every group. */
  groups: Group[];
  /** Ids of accessible groups, for quick membership checks. */
  groupIds: Set<string>;
  /** The user's role per accessible group (absent for super admins). */
  roles: Map<string, GroupRole>;
}

export function resolveScope(
  env: Env,
  groups: Group[],
  userId: string,
  login: string,
): AccessScope {
  const isSuper = isAdminUser(env, userId, login);
  const visible = isSuper ? groups : groups.filter((g) => memberRole(g, userId, login) != null);
  const roles = new Map<string, GroupRole>();
  for (const g of visible) {
    const role = memberRole(g, userId, login);
    if (role) roles.set(g.id, role);
  }
  return {
    isSuper,
    groups: visible,
    groupIds: new Set(visible.map((g) => g.id)),
    roles,
  };
}

/** The user's role in a group, or undefined when they have no access. */
export function roleAt(scope: AccessScope, groupId: string): GroupRole | undefined {
  if (scope.isSuper) return "owner";
  return scope.roles.get(groupId);
}

/** Role hierarchy: viewer < admin < owner. */
const ROLE_RANK: Record<GroupRole, number> = { viewer: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: GroupRole | undefined, min: GroupRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** owner | admin can edit routes; viewers are read-only. */
export function canEditRoutes(scope: AccessScope, groupId: string): boolean {
  return roleAtLeast(roleAt(scope, groupId), "admin");
}

/** Only owners (and super admins) may manage a group's settings and members. */
export function canEditGroup(scope: AccessScope, groupId: string): boolean {
  return roleAtLeast(roleAt(scope, groupId), "owner");
}

/** True if the user is a super admin or manages at least one group. */
export function hasAnyAccess(scope: AccessScope): boolean {
  return scope.isSuper || scope.groups.length > 0;
}
