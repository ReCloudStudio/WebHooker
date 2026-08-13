import { describe, it, expect } from "bun:test";
import { createAdminRoutes } from "../web/admin-routes";
import { createAdminSession, adminCookie } from "../web/session";
import { loadGroups } from "../web/groups";
import { loadRoutes } from "../config";
import { createInvite, listInvites } from "../web/invites";
import { getTenantSecret, setTenantSecret } from "../web/tenants";
import type { Env, Route } from "../types";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const v = store.get(key);
      if (v == null) return null;
      if (type === "json") return JSON.parse(v);
      return v;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
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

function createMockDB(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    KV: createMockKV(),
    DB: createMockDB(),
    ...overrides,
  };
}

describe("PUT /admin/api/groups/:id/rename", () => {
  const app = createAdminRoutes();

  async function setupGroups(kv: KVNamespace, groups: unknown[]): Promise<void> {
    await kv.put("config:groups", JSON.stringify(groups));
  }

  function renameReq(env: Env, cookie: string, groupId: string, newId: string): Promise<Response> {
    return app.request(
      `/api/groups/${encodeURIComponent(groupId)}/rename`,
      {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ newId }),
      },
      env,
    );
  }

  it("renames an owned group and follows routes, secret and invites", async () => {
    const kv = createMockKV();
    await setupGroups(kv, [
      {
        id: "old-team",
        name: "Old Team",
        adminIds: [],
        members: [{ login: "alice", role: "owner" }],
      },
    ]);
    await kv.put(
      "config:routes",
      JSON.stringify([
        {
          id: "r1",
          name: "R1",
          enabled: true,
          groupId: "old-team",
          filters: [{ type: "event", match: "push" }],
          targets: [{ channelId: "111" }],
        },
      ] as Route[]),
    );
    await setTenantSecret(kv, "old-team");
    const originalSecret = (await getTenantSecret(kv, "old-team"))!;
    await createInvite(kv, {
      groupId: "old-team",
      role: "viewer",
      expiresAt: Date.now() + 86400_000,
      createdBy: "alice",
    });
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");

    const res = await renameReq(env, adminCookie(sessionId), "old-team", "new-team");
    expect(res.status).toBe(200);

    const groups = await loadGroups(kv);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("new-team");
    expect(groups[0]!.name).toBe("Old Team");

    const routes = await loadRoutes(kv);
    expect(routes[0]!.groupId).toBe("new-team");

    expect(await getTenantSecret(kv, "new-team")).toBe(originalSecret);
    expect(await getTenantSecret(kv, "old-team")).toBeNull();

    const invites = await listInvites(kv, "new-team");
    expect(invites).toHaveLength(1);
    expect(invites[0]!.groupId).toBe("new-team");
    expect(await listInvites(kv, "old-team")).toHaveLength(0);
  });

  it("forbids non-owner members from renaming", async () => {
    const kv = createMockKV();
    await setupGroups(kv, [
      { id: "team", name: "Team", adminIds: [], members: [{ login: "bob", role: "admin" }] },
    ]);
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "2002", "bob");

    const res = await renameReq(env, adminCookie(sessionId), "team", "new-team");
    expect(res.status).toBe(403);
  });

  it("rejects invalid, duplicate or unchanged ids", async () => {
    const kv = createMockKV();
    await setupGroups(kv, [
      { id: "team", name: "Team", adminIds: [], members: [{ login: "alice", role: "owner" }] },
      { id: "other", name: "Other", adminIds: [] },
    ]);
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");
    const cookie = adminCookie(sessionId);

    expect((await renameReq(env, cookie, "team", "Bad ID!")).status).toBe(400);
    expect((await renameReq(env, cookie, "team", "team")).status).toBe(400);
    expect((await renameReq(env, cookie, "team", "other")).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const env = createEnv();
    const res = await app.request(
      "/api/groups/team/rename",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newId: "new-team" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown group", async () => {
    const kv = createMockKV();
    await setupGroups(kv, [
      { id: "mine", name: "Mine", adminIds: [], members: [{ login: "alice", role: "owner" }] },
    ]);
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");
    const res = await renameReq(env, adminCookie(sessionId), "nope", "new-team");
    expect(res.status).toBe(404);
  });
});
