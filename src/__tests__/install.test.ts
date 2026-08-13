import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createOAuthRoutes } from "../web/oauth-routes";
import { createAdminSession, adminCookie } from "../web/session";
import { loadGroups } from "../web/groups";
import { getInstallationAccount } from "../github/oauth";
import type { Env } from "../types";

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

function bufToPem(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = btoa(s);
  return `-----BEGIN PRIVATE KEY-----\n${b64.replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----`;
}

async function makeAppKeyPair(): Promise<{ appId: string; pem: string }> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return { appId: "12345", pem: bufToPem(pkcs8) };
}

describe("getInstallationAccount", () => {
  let calledUrls: string[];
  const restoredFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = restoredFetch;
  });

  function mockApi(status: number, body: unknown): void {
    calledUrls = [];
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calledUrls.push(String(input));
      void init;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    };
  }

  it("returns the installation account login using an App JWT", async () => {
    const { appId, pem } = await makeAppKeyPair();
    mockApi(200, { id: 555, account: { login: "myorg" } });
    const login = await getInstallationAccount(appId, pem, 555);
    expect(login).toBe("myorg");
    expect(calledUrls[0]).toContain("/app/installations/555");
  });

  it("returns null when the App credentials are missing", async () => {
    expect(await getInstallationAccount("", "", 555)).toBeNull();
  });

  it("returns null on API errors", async () => {
    const { appId, pem } = await makeAppKeyPair();
    mockApi(404, { message: "not found" });
    expect(await getInstallationAccount(appId, pem, 555)).toBeNull();
  });
});

describe("GET /github/install", () => {
  const app = createOAuthRoutes();
  const restoredFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init;
      return Promise.resolve(
        new Response(JSON.stringify({ id: 555, account: { login: "myorg" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = restoredFetch;
  });

  it("requires login first and preserves the installation id", async () => {
    const env = createEnv();
    const res = await app.request(
      "/github/install?installation_id=555",
      { headers: { accept: "text/html" } },
      env,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/github?redirect=");
    expect(decodeURIComponent(location)).toContain("/github/install?installation_id=555");
  });

  it("renders a choice page with the groups the user owns", async () => {
    const kv = createMockKV();
    await kv.put(
      "config:groups",
      JSON.stringify([
        { id: "mine", name: "My Team", adminIds: [], members: [{ login: "alice", role: "owner" }] },
        {
          id: "theirs",
          name: "Other Team",
          adminIds: [],
          members: [{ login: "bob", role: "owner" }],
        },
      ]),
    );
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");

    const res = await app.request(
      "/github/install?installation_id=555&setup_action=install",
      { headers: { cookie: adminCookie(sessionId), accept: "text/html" } },
      env,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("inst-555");
    expect(html).toContain("My Team");
    expect(html).toContain('value="mine"');
    expect(html).not.toContain('value="theirs"');
  });

  it("rejects a missing installation id", async () => {
    const env = createEnv();
    const res = await app.request("/github/install", { headers: { accept: "text/html" } }, env);
    expect(res.status).toBe(400);
  });
});

describe("POST /github/install/bind", () => {
  const app = createOAuthRoutes();
  const restoredFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init;
      return Promise.resolve(
        new Response(JSON.stringify({ id: 555, account: { login: "myorg" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = restoredFetch;
  });

  function formBody(params: Record<string, string>): string {
    return new URLSearchParams(params).toString();
  }

  it("binds the installation to an existing group the user owns", async () => {
    const kv = createMockKV();
    await kv.put(
      "config:groups",
      JSON.stringify([
        { id: "mine", name: "My Team", adminIds: [], members: [{ login: "alice", role: "owner" }] },
      ]),
    );
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");

    const res = await app.request(
      "/github/install/bind",
      {
        method: "POST",
        headers: {
          cookie: adminCookie(sessionId),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: formBody({ installation_id: "555", group: "mine" }),
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?install=ok");

    const groups = await loadGroups(kv);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("mine");
    expect(groups[0]!.installationId).toBe(555);
  });

  it("refuses to bind to a group the user does not own", async () => {
    const kv = createMockKV();
    await kv.put(
      "config:groups",
      JSON.stringify([
        {
          id: "theirs",
          name: "Other Team",
          adminIds: [],
          members: [{ login: "bob", role: "owner" }],
        },
      ]),
    );
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");

    const res = await app.request(
      "/github/install/bind",
      {
        method: "POST",
        headers: {
          cookie: adminCookie(sessionId),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: formBody({ installation_id: "555", group: "theirs" }),
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?error=forbidden");

    const groups = await loadGroups(kv);
    expect(groups[0]!.installationId).toBeUndefined();
  });

  it("auto-creates inst-{id} and joins the installer as owner (self-signup)", async () => {
    const kv = createMockKV();
    const { appId, pem } = await makeAppKeyPair();
    const env = createEnv({
      KV: kv,
      ALLOW_SELF_SIGNUP: "1",
      GITHUB_APP_ID: appId,
      GITHUB_PRIVATE_KEY: pem,
    });
    const sessionId = await createAdminSession(kv, "1001", "alice");

    const res = await app.request(
      "/github/install/bind",
      {
        method: "POST",
        headers: {
          cookie: adminCookie(sessionId),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: formBody({ installation_id: "555", group: "" }),
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?install=ok");

    const groups = await loadGroups(kv);
    const group = groups.find((g) => g.id === "inst-555");
    expect(group).toBeDefined();
    expect(group?.installationId).toBe(555);
    expect(group?.name).toBe("myorg");
    expect(group?.members).toContainEqual({ login: "alice", role: "owner" });
  });

  it("auto-creates inst-{id} without joining members when self-signup is off", async () => {
    const kv = createMockKV();
    const env = createEnv({ KV: kv });
    const sessionId = await createAdminSession(kv, "1001", "alice");

    const res = await app.request(
      "/github/install/bind",
      {
        method: "POST",
        headers: {
          cookie: adminCookie(sessionId),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: formBody({ installation_id: "555", group: "" }),
      },
      env,
    );
    expect(res.status).toBe(302);
    const groups = await loadGroups(kv);
    const group = groups.find((g) => g.installationId === 555);
    expect(group).toBeDefined();
    expect(group?.members ?? []).toHaveLength(0);
  });

  it("requires login to bind", async () => {
    const env = createEnv();
    const res = await app.request(
      "/github/install/bind",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formBody({ installation_id: "555", group: "" }),
      },
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin?error=forbidden");
  });
});
