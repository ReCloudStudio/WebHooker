import type { Env, Group, GroupMember, GroupRole } from "../types";
import { isAdminUser } from "./session";
import { log } from "../lib/log";

const GROUPS_KEY = "config:groups";

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
  try {
    const stored = await kv.get<Group[]>(GROUPS_KEY, "json");
    if (Array.isArray(stored)) return stored;
  } catch (err) {
    log.warn({ err }, "Failed to load groups from KV");
  }
  return [];
}

export async function saveGroups(kv: KVNamespace, groups: Group[]): Promise<void> {
  await kv.put(GROUPS_KEY, JSON.stringify(groups));
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
