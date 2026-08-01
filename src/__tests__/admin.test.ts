import { describe, it, expect, beforeEach } from "bun:test";
import {
  isAdminUser,
  createAdminSession,
  getAdminSession,
  destroyAdminSession,
  adminCookie,
  clearAdminCookie,
} from "../admin-session";
import { loadRoutes, saveRoutes, loadConfig } from "../config";
import type { Env, Route } from "../types";

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

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    KV: createMockKV(),
    DISCORD_GATEWAY: {} as DurableObjectNamespace,
    ...overrides,
  };
}

const sampleRoutes: Route[] = [
  {
    id: "backend-prs",
    name: "Backend PRs",
    enabled: true,
    filters: [{ type: "event", match: "pull_request" }],
    target: { channelId: "111" },
  },
];

describe("isAdminUser", () => {
  it("allows matching user id", () => {
    const env = createEnv({ ADMIN_USER_IDS: "12345,67890" });
    expect(isAdminUser(env, "12345", "other")).toBe(true);
  });

  it("allows matching login case-insensitively", () => {
    const env = createEnv({ ADMIN_USER_IDS: "RhenCloud" });
    expect(isAdminUser(env, "1", "rhencloud")).toBe(true);
  });

  it("rejects non-admin users", () => {
    const env = createEnv({ ADMIN_USER_IDS: "12345" });
    expect(isAdminUser(env, "99999", "someone")).toBe(false);
  });

  it("rejects when whitelist is empty", () => {
    const env = createEnv();
    expect(isAdminUser(env, "12345", "rhencloud")).toBe(false);
  });
});

describe("admin-session", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it("creates and retrieves a session from cookie", async () => {
    const sessionId = await createAdminSession(kv, "12345", "rhencloud");
    const session = await getAdminSession(kv, adminCookie(sessionId));
    expect(session).toEqual({ userId: "12345", login: "rhencloud" });
  });

  it("returns null without a cookie", async () => {
    expect(await getAdminSession(kv, undefined)).toBeNull();
  });

  it("returns null for unknown session id", async () => {
    expect(await getAdminSession(kv, "wh_admin_session=nope")).toBeNull();
  });

  it("destroys a session", async () => {
    const sessionId = await createAdminSession(kv, "12345", "rhencloud");
    await destroyAdminSession(kv, adminCookie(sessionId));
    expect(await getAdminSession(kv, adminCookie(sessionId))).toBeNull();
  });

  it("clear cookie is an expired cookie", () => {
    expect(clearAdminCookie()).toContain("wh_admin_session=;");
    expect(clearAdminCookie()).toContain("Max-Age=0");
  });
});

describe("config routes persistence", () => {
  it("saves and loads routes from KV", async () => {
    const kv = createMockKV();
    await saveRoutes(kv, sampleRoutes);
    expect(await loadRoutes(kv)).toEqual(sampleRoutes);
  });

  it("returns empty routes when KV is empty", async () => {
    const kv = createMockKV();
    const routes = await loadRoutes(kv);
    expect(routes).toHaveLength(0);
  });

  it("loadConfig picks up saved routes after cache invalidation", async () => {
    const env = createEnv();
    const first = await loadConfig(env);
    expect(first.routes).toHaveLength(0);

    await saveRoutes(env.KV, sampleRoutes);
    const second = await loadConfig(env);
    expect(second.routes).toHaveLength(1);
    expect(second.routes[0]!.id).toBe("backend-prs");
    expect(second.routes[0]!.target.channelId).toBe("111");
  });
});
