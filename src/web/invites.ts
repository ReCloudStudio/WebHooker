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

const INVITE_TTL = 7 * 24 * 3600;

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

export async function createInvite(kv: KVNamespace, invite: Invite): Promise<string> {
  const token = generateInviteToken();
  await kv.put(inviteKey(token), JSON.stringify(invite), { expirationTtl: INVITE_TTL });
  return token;
}

export async function getInvite(kv: KVNamespace, token: string): Promise<Invite | null> {
  try {
    const raw = await kv.get<Invite>(inviteKey(token), "json");
    if (!raw) return null;
    if (Date.now() > raw.expiresAt) {
      await kv.delete(inviteKey(token));
      return null;
    }
    return raw;
  } catch (err) {
    log.warn({ err }, "Failed to load invite");
    return null;
  }
}

export async function consumeInvite(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(inviteKey(token));
}

/** All pending (unexpired) invites of a group. */
export async function listInvites(kv: KVNamespace, groupId: string): Promise<Array<Invite & { token: string }>> {
  try {
    const { keys } = await kv.list({ prefix: "invite:" });
    const out: Array<Invite & { token: string }> = [];
    for (const key of keys) {
      const token = key.name.slice("invite:".length);
      const invite = await getInvite(kv, token);
      if (invite && invite.groupId === groupId) out.push({ ...invite, token });
    }
    return out;
  } catch (err) {
    log.warn({ err }, "Failed to list invites");
    return [];
  }
}

export async function revokeInvite(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(inviteKey(token));
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
