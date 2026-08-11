import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sendMessage } from "../drivers/discord/rest";
import { renderNeutralMessage } from "../drivers/discord/render";
import { dispatchEvent } from "../core/dispatch";
import type { Env, Route } from "../types";

function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    Promise.resolve(handler(String(input), init));
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    KV: {} as KVNamespace,
    DB: {} as D1Database,
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

describe("discord role mentions", () => {
  it("renders mentionRoleIds into the message content", () => {
    const out = renderNeutralMessage({
      title: "T",
      mentionRoleIds: ["111", "222"],
    });
    expect(out.content).toBe("<@&111> <@&222>");
    expect(out.embeds?.[0]?.title).toBe("T");
  });

  it("omits content when no roles are mentioned", () => {
    const out = renderNeutralMessage({ title: "T" });
    expect(out.content).toBeUndefined();
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
    const env = createEnv({ KV: createMockKV(), DB: createMockDB() });
    const routes: Route[] = [
      {
        id: "regular-push",
        name: "Regular Push",
        enabled: true,
        filters: [{ type: "event", match: "push" }],
        targets: [{ channelId: "111" }],
      },
      {
        id: "catch-all",
        name: "Catch all",
        enabled: true,
        filters: [],
        fallback: true,
        targets: [{ channelId: "222" }],
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

  it("prepends role mentions to the Discord message content", async () => {
    const bodies: string[] = [];
    mockFetch((url, init) => {
      bodies.push(String(init?.body ?? ""));
      return new Response("{}", { status: 200 });
    });
    const env = createEnv({ KV: createMockKV(), DB: createMockDB() });
    const routes: Route[] = [
      {
        id: "mention-push",
        name: "Mention Push",
        enabled: true,
        discordRoleIds: ["111", "222"],
        filters: [{ type: "event", match: "push" }],
        targets: [{ channelId: "333" }],
      },
    ];

    await dispatchEvent({ ...baseConfig, routes }, { event: "push", payload: {} }, env);

    expect(bodies).toHaveLength(1);
    const parsed = JSON.parse(bodies[0]!) as {
      content?: string;
      embeds?: Array<{ title?: string }>;
    };
    expect(parsed.content).toBe("<@&111> <@&222>");
    expect(parsed.embeds?.[0]).toBeDefined();
  });

  it("filters events by the group's source provider", async () => {
    const sent: string[] = [];
    mockFetch((url) => {
      sent.push(url);
      return new Response("{}", { status: 200 });
    });
    const kv = createMockKV();
    await kv.put(
      "config:groups",
      JSON.stringify([
        { id: "gh", name: "GH", adminIds: [], providers: ["github"] },
        { id: "gitea", name: "Gitea", adminIds: [], providers: ["gitea"] },
      ]),
    );
    const env = createEnv({ KV: kv, DB: createMockDB() });
    const routes: Route[] = [
      {
        id: "gh-push",
        name: "GH",
        enabled: true,
        groupId: "gh",
        filters: [{ type: "event", match: "push" }],
        targets: [{ channelId: "111" }],
      },
      {
        id: "gitea-push",
        name: "Gitea",
        enabled: true,
        groupId: "gitea",
        filters: [{ type: "event", match: "push" }],
        targets: [{ channelId: "222" }],
      },
    ];

    await dispatchEvent(
      { ...baseConfig, routes },
      { event: "push", payload: {}, provider: "gitea" },
      env,
    );

    expect(sent.filter((u) => u.includes("/222/"))).toHaveLength(1);
    expect(sent.filter((u) => u.includes("/111/"))).toHaveLength(0);
  });
});
