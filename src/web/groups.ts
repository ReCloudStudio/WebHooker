import type { Env, Group } from "../types";
import { isAdminUser } from "./session";
import { log } from "../lib/log";

const GROUPS_KEY = "config:groups";

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
  /** Groups the user may view/edit. When isSuper, this is every group. */
  groups: Group[];
  /** Ids of accessible groups, for quick membership checks. */
  groupIds: Set<string>;
}

export function resolveScope(
  env: Env,
  groups: Group[],
  userId: string,
  login: string,
): AccessScope {
  const isSuper = isAdminUser(env, userId, login);
  const visible = isSuper ? groups : groups.filter((g) => isGroupAdmin(g, userId, login));
  return {
    isSuper,
    groups: visible,
    groupIds: new Set(visible.map((g) => g.id)),
  };
}

/** True if the user is a super admin or manages at least one group. */
export function hasAnyAccess(scope: AccessScope): boolean {
  return scope.isSuper || scope.groups.length > 0;
}
