import { loadGroups, saveGroups, identityMatches, normalizeGroupMembers } from "./groups";
import { log } from "../lib/log";

export interface Invite {
  groupId: string;
  /** Invited users can never be owners; only admins or viewers. */
  role: "admin" | "viewer";
  expiresAt: number;
  createdBy: string;
  note?: string;
}

const INVITE_TTL = 24 * 3600;

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function inviteKey(token: string): string {
  return `invite:${token}`;
}

/**
 * Per-group index of invite tokens. Listing pending invites reads this key
 * instead of `kv.list({ prefix })`, which is eventually consistent and can
 * lag behind a fresh write by minutes — the index keeps listing reliable.
 */
function indexKey(groupId: string): string {
  return `invite:group:${groupId}`;
}

async function readIndex(kv: KVNamespace, groupId: string): Promise<string[]> {
  try {
    const raw = await kv.get<string[]>(indexKey(groupId), "json");
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    log.warn({ err, groupId }, "Failed to read invite index");
    return [];
  }
}

async function writeIndex(kv: KVNamespace, groupId: string, tokens: string[]): Promise<void> {
  await kv.put(indexKey(groupId), JSON.stringify(tokens));
}

async function removeFromIndex(kv: KVNamespace, groupId: string, token: string): Promise<void> {
  const tokens = (await readIndex(kv, groupId)).filter((t) => t !== token);
  await writeIndex(kv, groupId, tokens);
}

export async function createInvite(kv: KVNamespace, invite: Invite): Promise<string> {
  const token = generateInviteToken();
  await kv.put(inviteKey(token), JSON.stringify(invite), { expirationTtl: INVITE_TTL });
  const tokens = await readIndex(kv, invite.groupId);
  tokens.push(token);
  await writeIndex(kv, invite.groupId, tokens);
  return token;
}

export async function getInvite(kv: KVNamespace, token: string): Promise<Invite | null> {
  try {
    const raw = await kv.get<Invite>(inviteKey(token), "json");
    if (!raw) return null;
    if (Date.now() > raw.expiresAt) {
      await kv.delete(inviteKey(token));
      await removeFromIndex(kv, raw.groupId, token);
      return null;
    }
    return raw;
  } catch (err) {
    log.warn({ err }, "Failed to load invite");
    return null;
  }
}

export async function consumeInvite(kv: KVNamespace, token: string): Promise<void> {
  const raw = await kv.get<Invite>(inviteKey(token), "json");
  await kv.delete(inviteKey(token));
  if (raw) await removeFromIndex(kv, raw.groupId, token);
}

/** All pending (unexpired) invites of a group, via the per-group index. */
export async function listInvites(
  kv: KVNamespace,
  groupId: string,
): Promise<Array<Invite & { token: string }>> {
  try {
    const tokens = await readIndex(kv, groupId);
    const out: Array<Invite & { token: string }> = [];
    const stale: string[] = [];
    for (const token of tokens) {
      const invite = await getInvite(kv, token);
      if (invite && invite.groupId === groupId) {
        out.push({ ...invite, token });
      } else {
        stale.push(token);
      }
    }
    if (stale.length > 0) {
      await writeIndex(
        kv,
        groupId,
        tokens.filter((t) => !stale.includes(t)),
      );
    }
    return out;
  } catch (err) {
    log.warn({ err }, "Failed to list invites");
    return [];
  }
}

export async function revokeInvite(kv: KVNamespace, token: string): Promise<void> {
  const raw = await kv.get<Invite>(inviteKey(token), "json");
  await kv.delete(inviteKey(token));
  if (raw) await removeFromIndex(kv, raw.groupId, token);
}

/**
 * Re-point every pending invite of a group to its new id (group rename).
 * Best-effort: a failure leaves the old invites in place (they will be
 * rejected as group-missing after the rename).
 */
export async function migrateInvites(kv: KVNamespace, from: string, to: string): Promise<void> {
  try {
    const tokens = await readIndex(kv, from);
    if (tokens.length === 0) {
      await kv.delete(indexKey(from));
      return;
    }
    const moved: string[] = [];
    for (const token of tokens) {
      const invite = await kv.get<Invite>(inviteKey(token), "json");
      if (invite && invite.groupId === from) {
        await kv.put(inviteKey(token), JSON.stringify({ ...invite, groupId: to }), {
          expirationTtl: INVITE_TTL,
        });
        moved.push(token);
      }
    }
    await kv.put(indexKey(to), JSON.stringify(moved));
    await kv.delete(indexKey(from));
  } catch (err) {
    log.warn({ err, from, to }, "Failed to migrate invites on group rename");
  }
}

/**
 * Adds the accepting user to the invited group (or upgrades their role when
 * they are already a viewer) and consumes the invite. The invited role is
 * never an owner — ownership stays with the inviter's discretion.
 */
export async function acceptInvite(
  kv: KVNamespace,
  token: string,
  userId: string,
  login: string,
): Promise<
  | { ok: true; groupId: string; role: "admin" | "viewer" }
  | { ok: false; reason: "invalid" | "group-missing" }
> {
  const invite = await getInvite(kv, token);
  if (!invite) return { ok: false, reason: "invalid" };
  const groups = await loadGroups(kv);
  const group = groups.find((g) => g.id === invite.groupId);
  if (!group) return { ok: false, reason: "group-missing" };

  const members = normalizeGroupMembers(group);
  const idx = members.findIndex((m) => identityMatches([m.login], userId, login));
  if (idx >= 0) {
    if (invite.role === "admin" && members[idx]!.role === "viewer") {
      members[idx]!.role = "admin";
    }
  } else {
    members.push({ login, role: invite.role });
  }
  const next = groups.map((g) =>
    g.id === group.id
      ? {
          ...g,
          members,
          adminIds: members.filter((m) => m.role === "owner").map((m) => m.login),
        }
      : g,
  );
  await saveGroups(kv, next);
  await consumeInvite(kv, token);
  return { ok: true, groupId: group.id, role: invite.role };
}
