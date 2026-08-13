import { describe, it, expect, beforeEach } from "bun:test";
import {
  createInvite,
  getInvite,
  listInvites,
  revokeInvite,
  acceptInvite,
} from "../server/lib/web/invites";
import { saveGroups, loadGroups } from "../server/lib/web/groups";
import type { Group } from "../server/lib/types";

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiration?: number }>();
  return {
    get: async (key: string, type?: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiration && Date.now() / 1000 > entry.expiration) {
        store.delete(key);
        return null;
      }
      if (type === "json") return JSON.parse(entry.value);
      return entry.value;
    },
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      const expiration = opts?.expirationTtl ? Date.now() / 1000 + opts.expirationTtl : undefined;
      store.set(key, { value, expiration });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({
      keys: [...store.keys()].map((k) => ({ name: k })),
      list_complete: true,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

const group: Group = {
  id: "team",
  name: "Team",
  adminIds: ["boss"],
  members: [{ login: "boss", role: "owner" }],
};

describe("invites", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it("creates and reads back an invite", async () => {
    const token = await createInvite(kv, {
      groupId: "team",
      role: "admin",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    const invite = await getInvite(kv, token);
    expect(invite).toMatchObject({ groupId: "team", role: "admin", createdBy: "boss" });
  });

  it("lists pending invites of a group only", async () => {
    await createInvite(kv, {
      groupId: "team",
      role: "viewer",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    await createInvite(kv, {
      groupId: "other",
      role: "viewer",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    const invites = await listInvites(kv, "team");
    expect(invites).toHaveLength(1);
    expect(invites[0]!.groupId).toBe("team");
  });

  it("revokes an invite", async () => {
    const token = await createInvite(kv, {
      groupId: "team",
      role: "viewer",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    await revokeInvite(kv, token);
    expect(await getInvite(kv, token)).toBeNull();
  });

  it("accept adds the user as a member and consumes the token", async () => {
    await saveGroups(kv, [group]);
    const token = await createInvite(kv, {
      groupId: "team",
      role: "admin",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    const result = await acceptInvite(kv, token, "777", "newbie");
    expect(result).toEqual({ ok: true, groupId: "team", role: "admin" });
    expect(await getInvite(kv, token)).toBeNull();
    const groups = await loadGroups(kv);
    expect(groups[0]!.members).toContainEqual({ login: "newbie", role: "admin" });
    // adminIds stays in sync with owners only.
    expect(groups[0]!.adminIds).toEqual(["boss"]);
  });

  it("upgrades an existing viewer to admin", async () => {
    await saveGroups(kv, [
      {
        ...group,
        members: [
          { login: "boss", role: "owner" },
          { login: "newbie", role: "viewer" },
        ],
      },
    ]);
    const token = await createInvite(kv, {
      groupId: "team",
      role: "admin",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    await acceptInvite(kv, token, "777", "newbie");
    const groups = await loadGroups(kv);
    expect(groups[0]!.members).toContainEqual({ login: "newbie", role: "admin" });
  });

  it("rejects expired or unknown invites", async () => {
    await saveGroups(kv, [group]);
    const token = await createInvite(kv, {
      groupId: "team",
      role: "viewer",
      expiresAt: Date.now() - 1000,
      createdBy: "boss",
    });
    expect(await acceptInvite(kv, token, "1", "x")).toEqual({ ok: false, reason: "invalid" });
    expect(await acceptInvite(kv, "deadbeef", "1", "x")).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects invites for missing groups", async () => {
    await saveGroups(kv, []);
    const token = await createInvite(kv, {
      groupId: "ghost",
      role: "viewer",
      expiresAt: Date.now() + 86400_000,
      createdBy: "boss",
    });
    expect(await acceptInvite(kv, token, "1", "x")).toEqual({ ok: false, reason: "group-missing" });
  });
});
