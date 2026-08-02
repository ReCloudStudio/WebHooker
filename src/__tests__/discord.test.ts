import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sendMessage } from "../discord-rest";
import { dispatchEvent, isGatewayEnabled } from "../discord";
import type { Env, Route } from "../types";

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response,
): void {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    Promise.resolve(handler(String(input), init));
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    KV: {} as KVNamespace,
    DISCORD_GATEWAY: {} as DurableObjectNamespace,
    ...overrides,
  };
}

const restoredFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = restoredFetch;
});

describe("discord-rest sendMessage", () => {
  beforeEach(() => {
    mockFetch(() => new Response("{}", { status: 200 }));
  });

  it("posts to the channel URL with bot auth", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    mockFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response("{}", { status: 200 });
    });

    const result = await sendMessage("token-abc", "111", { embeds: [] });

    expect(result.ok).toBe(true);
    expect(capturedUrl).toBe("https://discord.com/api/v10/channels/111/messages");
    expect(capturedInit!.method).toBe("POST");
    expect((capturedInit!.headers as Record<string, string>).Authorization).toBe("Bot token-abc");
    expect((capturedInit!.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("posts to the thread URL when threadId is given", async () => {
    let capturedUrl = "";
    mockFetch((url) => {
      capturedUrl = url;
      return new Response("{}", { status: 200 });
    });

    await sendMessage("t", "111", {}, "999");

    expect(capturedUrl).toBe("https://discord.com/api/v10/channels/999/messages");
  });

  it("returns error on non-ok response", async () => {
    mockFetch(() => new Response("Missing Permissions", { status: 403 }));
    const result = await sendMessage("t", "111", {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Missing Permissions");
  });
});

describe("isGatewayEnabled", () => {
  it("is enabled only when set to true", () => {
    expect(isGatewayEnabled(createEnv({ DISCORD_GATEWAY_ENABLED: "true" }))).toBe(true);
    expect(isGatewayEnabled(createEnv({ DISCORD_GATEWAY_ENABLED: "false" }))).toBe(false);
    expect(isGatewayEnabled(createEnv())).toBe(false);
  });
});

describe("dispatchEvent fallback routing", () => {
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

  const baseConfig = {
    baseUrl: "https://example.com",
    github: {
      webhookSecret: "s",
      appId: 1,
      privateKey: "",
      clientId: "",
      clientSecret: "",
    },
    discord: { token: "t" },
    routes: [] as Route[],
  };

  it("fires a filter-less fallback route only when no regular route matched", async () => {
    const sent: string[] = [];
    mockFetch((url) => {
      sent.push(url);
      return new Response("{}", { status: 200 });
    });
    const env = createEnv({ KV: createMockKV() });
    const routes: Route[] = [
      {
        id: "regular-push",
        name: "Regular Push",
        enabled: true,
        filters: [{ type: "event", match: "push" }],
        target: { channelId: "111" },
      },
      {
        id: "catch-all",
        name: "Catch all",
        enabled: true,
        filters: [],
        fallback: true,
        target: { channelId: "222" },
      },
    ];

    await dispatchEvent({ ...baseConfig, routes }, { event: "push", payload: {} }, env);
    expect(sent.filter((u) => u.includes("/111/"))).toHaveLength(1);
    expect(sent.filter((u) => u.includes("/222/"))).toHaveLength(0);

    sent.length = 0;
    await dispatchEvent(
      { ...baseConfig, routes },
      {
        event: "issues",
        payload: {
          action: "opened",
          issue: {
            number: 1,
            title: "Test issue",
            body: "body",
            state: "open",
            html_url: "https://example.com/i/1",
            user: { login: "octocat" },
          },
          repository: { full_name: "owner/repo" },
          sender: { login: "octocat" },
        },
      },
      env,
    );
    expect(sent.filter((u) => u.includes("/111/"))).toHaveLength(0);
    expect(sent.filter((u) => u.includes("/222/"))).toHaveLength(1);
  });
});
