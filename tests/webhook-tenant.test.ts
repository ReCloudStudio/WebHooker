import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createHmac } from "crypto";
import { processWebhook } from "../server/lib/webhook";
import { invalidateConfigCache } from "../server/lib/config";
import { loadGroups } from "../server/lib/web/groups";
import type { Env, Route } from "../server/lib/types";

function githubSign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

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
    GITHUB_WEBHOOK_SECRET: "global-secret",
    KV: createMockKV(),
    DB: createMockDB(),
    ...overrides,
  };
}

describe("processWebhook", () => {
  let fetched: Array<{ url: string; body: string }>;
  const restoredFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = restoredFetch;
  });

  function mockFetch(): void {
    fetched = [];
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      fetched.push({ url: String(input), body: String(init?.body ?? "") });
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
  }

  beforeEach(() => {
    invalidateConfigCache();
  });

  /** waitUntil collector: lets the test await the dispatched work. */
  function makeWait(): {
    waitUntil: (p: Promise<unknown>) => void;
    flush: () => Promise<void>;
  } {
    const pending: Promise<unknown>[] = [];
    return {
      waitUntil: (p: Promise<unknown>): void => {
        pending.push(p);
      },
      flush: (): Promise<void> => Promise.allSettled(pending).then(() => undefined),
    };
  }

  async function setupTenant(secret: string, extraRoutes: Route[] = []): Promise<Env> {
    const kv = createMockKV();
    await kv.put("config:groups", JSON.stringify([{ id: "team-a", name: "Team A", adminIds: [] }]));
    await kv.put("tenant:team-a", secret);
    await kv.put(
      "config:routes",
      JSON.stringify([
        {
          id: "team-a-push",
          name: "Team A Push",
          enabled: true,
          groupId: "team-a",
          filters: [{ type: "event", match: "push" }],
          targets: [{ channelId: "111" }],
        },
        {
          id: "other-push",
          name: "Other Push",
          enabled: true,
          groupId: "other",
          filters: [{ type: "event", match: "push" }],
          targets: [{ channelId: "222" }],
        },
        ...extraRoutes,
      ] as Route[]),
    );
    return createEnv({ KV: kv });
  }

  it("dispatches only the tenant group's routes on a valid signature", async () => {
    mockFetch();
    const secret = "tenant-secret-1";
    const env = await setupTenant(secret);
    const body = JSON.stringify({ ref: "refs/heads/main", commits: [] });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      body,
      {
        "x-github-event": "push",
        "x-hub-signature-256": githubSign(body, secret),
        "x-github-delivery": "deliv-1",
      },
      wait.waitUntil,
      "team-a",
    );
    expect(res.status).toBe(200);
    await wait.flush();
    expect(fetched.some((f) => f.url.includes("/111/"))).toBe(true);
    expect(fetched.some((f) => f.url.includes("/222/"))).toBe(false);
  });

  it("rejects an invalid signature with 401", async () => {
    const env = await setupTenant("tenant-secret-1");
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      body,
      {
        "x-github-event": "push",
        "x-hub-signature-256": "sha256=wrong",
        "x-github-delivery": "deliv-2",
      },
      wait.waitUntil,
      "team-a",
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown group", async () => {
    const env = await setupTenant("tenant-secret-1");
    const wait = makeWait();
    const res = await processWebhook(
      env,
      "{}",
      { "x-github-event": "push" },
      wait.waitUntil,
      "nope",
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the group has no tenant secret", async () => {
    const kv = createMockKV();
    await kv.put("config:groups", JSON.stringify([{ id: "g", name: "G", adminIds: [] }]));
    const env = createEnv({ KV: kv });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      "{}",
      { "x-github-event": "push", "x-hub-signature-256": "sha256=x" },
      wait.waitUntil,
      "g",
    );
    expect(res.status).toBe(404);
  });

  it("dedupes delivery ids per tenant", async () => {
    mockFetch();
    const secret = "tenant-secret-1";
    const env = await setupTenant(secret);
    const body = JSON.stringify({ ref: "refs/heads/main", commits: [] });
    const headers = {
      "x-github-event": "push",
      "x-hub-signature-256": githubSign(body, secret),
      "x-github-delivery": "same-deliv",
    };
    const first = await processWebhook(env, body, headers, makeWait().waitUntil, "team-a");
    const second = await processWebhook(env, body, headers, makeWait().waitUntil, "team-a");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, duplicate: true });
    expect(fetched).toHaveLength(1);
  });

  it("accepts custom webhooks signed with the tenant secret", async () => {
    mockFetch();
    const secret = "tenant-secret-1";
    const env = await setupTenant(secret, [
      {
        id: "custom-alerts",
        name: "Custom Alerts",
        enabled: true,
        groupId: "team-a",
        filters: [{ type: "event", match: "custom" }],
        targets: [{ channelId: "333" }],
      },
    ]);
    const body = JSON.stringify({
      title: "Deploy failed",
      repo: "acme/widget",
      color: "red",
      description: "prod down",
    });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      body,
      { "x-webhooker-signature": githubSign(body, secret) },
      wait.waitUntil,
      "team-a",
    );
    expect(res.status).toBe(200);
    await wait.flush();
    const sent = fetched.filter((f) => f.url.includes("/333/"));
    expect(sent).toHaveLength(1);
    const parsed = JSON.parse(sent[0]!.body) as {
      embeds?: Array<{ title?: string; color?: number; description?: string }>;
    };
    expect(parsed.embeds?.[0]?.title).toBe("acme/widget: Deploy failed");
    expect(parsed.embeds?.[0]?.color).toBe(0xf85149);
    expect(parsed.embeds?.[0]?.description).toBe("prod down");
  });

  it("rejects custom webhooks without a signature header", async () => {
    const env = await setupTenant("tenant-secret-1");
    const wait = makeWait();
    const res = await processWebhook(
      env,
      JSON.stringify({ title: "x" }),
      {},
      wait.waitUntil,
      "team-a",
    );
    expect(res.status).toBe(400);
  });

  it("keeps the legacy global endpoint working with the global secret", async () => {
    mockFetch();
    const kv = createMockKV();
    await kv.put(
      "config:routes",
      JSON.stringify([
        {
          id: "all",
          name: "All",
          enabled: true,
          filters: [],
          targets: [{ channelId: "111" }],
        },
      ] as Route[]),
    );
    const env = createEnv({ KV: kv });
    const body = JSON.stringify({ ref: "refs/heads/main", commits: [] });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      body,
      {
        "x-github-event": "push",
        "x-hub-signature-256": githubSign(body, "global-secret"),
        "x-github-delivery": "g-1",
      },
      wait.waitUntil,
    );
    expect(res.status).toBe(200);
    await wait.flush();
    expect(fetched.some((f) => f.url.includes("/111/"))).toBe(true);
  });

  it("keeps a group's routes isolated by GitHub App installation id", async () => {
    mockFetch();
    const kv = createMockKV();
    await kv.put(
      "config:groups",
      JSON.stringify([
        { id: "inst-1", name: "Install 1", adminIds: [], installationId: 101 },
        { id: "inst-2", name: "Install 2", adminIds: [], installationId: 202 },
      ]),
    );
    await kv.put(
      "config:routes",
      JSON.stringify([
        {
          id: "r1",
          name: "R1",
          enabled: true,
          groupId: "inst-1",
          filters: [],
          targets: [{ channelId: "111" }],
        },
        {
          id: "r2",
          name: "R2",
          enabled: true,
          groupId: "inst-2",
          filters: [],
          targets: [{ channelId: "222" }],
        },
      ] as Route[]),
    );
    const env = createEnv({ KV: kv });

    // Global endpoint: installation 101's event may only reach group inst-1.
    const body = JSON.stringify({
      installation: { id: 101 },
      repository: { full_name: "org-a/repo" },
      ref: "refs/heads/main",
      commits: [],
    });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      body,
      {
        "x-github-event": "push",
        "x-hub-signature-256": githubSign(body, "global-secret"),
        "x-github-delivery": "inst-1-deliv",
      },
      wait.waitUntil,
    );
    expect(res.status).toBe(200);
    await wait.flush();
    expect(fetched.some((f) => f.url.includes("/111/"))).toBe(true);
    expect(fetched.some((f) => f.url.includes("/222/"))).toBe(false);
  });

  it("auto-provisions a group on installation.created", async () => {
    mockFetch();
    const kv = createMockKV();
    await kv.put(
      "config:routes",
      JSON.stringify([
        {
          id: "install-events",
          name: "Install Events",
          enabled: true,
          filters: [{ type: "event", match: "installation" }],
          targets: [{ channelId: "111" }],
        },
      ] as Route[]),
    );
    const env = createEnv({ KV: kv });
    const body = JSON.stringify({
      action: "created",
      installation: { id: 555, account: { login: "myorg", type: "Organization" } },
      repositories: [{ full_name: "myorg/repo" }],
      sender: { login: "admin" },
    });
    const wait = makeWait();
    const res = await processWebhook(
      env,
      body,
      {
        "x-github-event": "installation",
        "x-hub-signature-256": githubSign(body, "global-secret"),
        "x-github-delivery": "inst-event-1",
      },
      wait.waitUntil,
    );
    expect(res.status).toBe(200);
    await wait.flush();

    const groups = await loadGroups(kv);
    const bound = groups.find((g) => g.installationId === 555);
    expect(bound).toBeDefined();
    expect(bound?.id).toBe("inst-555");
    expect(bound?.name).toBe("myorg");
    // The auto-created group is only visible to super admins (no members).
    expect(bound?.members ?? []).toHaveLength(0);
  });
});
