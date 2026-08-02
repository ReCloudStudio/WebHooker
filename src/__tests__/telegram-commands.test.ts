import { describe, it, expect, afterEach } from "bun:test";
import { handleTelegramUpdate } from "../drivers/telegram/commands";
import { handleTelegramWebhookRequest } from "../drivers/telegram/updates";
import type { Env } from "../types";

function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    Promise.resolve(handler(String(input), init));
}

const restoredFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = restoredFetch;
});

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [] }),
  } as unknown as KVNamespace;
}

function createMockDB(): D1Database {
  const links = new Map<string, string>();
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        run: async (): Promise<{ success: boolean }> => {
          const m = sql.match(/INSERT OR REPLACE INTO telegram_links \(telegram_user_id, github_user_id\) VALUES \(\?, \?\)/);
          if (m) links.set(String(args[0]), String(args[1]));
          const del = sql.match(/DELETE FROM telegram_links WHERE telegram_user_id = \?/);
          if (del) links.delete(String(args[0]));
          return { success: true };
        },
        all: async (): Promise<{ results: Array<Record<string, unknown>> }> => {
          const sel = sql.match(/SELECT github_user_id FROM telegram_links WHERE telegram_user_id = \?/);
          if (sel) {
            const val = links.get(String(args[0]));
            return { results: val ? [{ github_user_id: val }] : [] };
          }
          return { results: [] };
        },
        first: async () => null,
      }),
    }),
  } as unknown as D1Database;
}

function createEnv(): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    GITHUB_CLIENT_ID: "client-id",
    TELEGRAM_TOKEN: "tg-token",
    TELEGRAM_WEBHOOK_SECRET: "wh-secret",
    KV: createMockKV(),
    DB: createMockDB(),
  } as Env;
}

function reply(chatId: string, topicId?: number): Record<string, unknown> {
  return {
    message_id: 1,
    from: { id: 111, first_name: "Rhen" },
    chat: { id: chatId, type: "supergroup" },
    message_thread_id: topicId,
  };
}

describe("telegram-commands /gh login", () => {
  it("stores state with telegramUserId and replies with OAuth URL", async () => {
    let sentBody: Record<string, unknown> | undefined;
    mockFetch((_url, init) => {
      sentBody = JSON.parse(String(init!.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    });

    const env = createEnv();
    await handleTelegramUpdate(env, {
      message: { ...reply("-100123"), text: "/gh login" },
    });

    expect(sentBody?.chat_id).toBe("-100123");
    expect(String(sentBody?.text)).toContain("github.com/login/oauth/authorize");
  });
});

describe("telegram-commands /gh logout", () => {
  it("replies bound/unbound message", async () => {
    let sentText = "";
    mockFetch((_url, init) => {
      sentText = String((JSON.parse(String(init!.body)) as Record<string, unknown>).text);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    });

    const env = createEnv();
    await handleTelegramUpdate(env, {
      message: { ...reply("-100123"), text: "/gh logout" },
    });

    expect(sentText).toContain("已解绑");
  });
});

describe("telegram-commands /gh comment", () => {
  it("replies when no reply_to_message link present", async () => {
    let sentText = "";
    mockFetch((_url, init) => {
      sentText = String((JSON.parse(String(init!.body)) as Record<string, unknown>).text);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    });

    const env = createEnv();
    await handleTelegramUpdate(env, {
      message: { ...reply("-100123"), text: "/gh comment hello" },
    });

    expect(sentText).toContain("还没有绑定");
  });

  it("parses the replied-to GitHub link as target", async () => {
    const env = createEnv();
    const { saveTelegramLink } = await import("../github/store");
    await saveTelegramLink(env.DB, "111", "111980217");
    await env.KV.put(
      "token:111980217",
      JSON.stringify({
        userId: "111980217",
        accessToken: "ghu_test",
        expiresAt: Date.now() + 3600_000,
      }),
    );

    const calls: Array<{ url: string; body: string }> = [];
    mockFetch((url, init) => {
      calls.push({ url, body: String(init!.body) });
      if (String(url).endsWith("/sendMessage")) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ html_url: "https://github.com/acme/widget/issues/7#issuecomment-9" }),
        { status: 200 },
      );
    });

    await handleTelegramUpdate(env, {
      message: {
        ...reply("-100123"),
        text: "/gh comment hello",
        reply_to_message: {
          ...reply("-100123"),
          text: "acme/widget#7: Add feature",
          entities: [{ type: "text_link", url: "https://github.com/acme/widget/issues/7" }],
        },
      },
    });

    const ghCall = calls.find((c) => c.url.includes("/repos/"));
    expect(ghCall).toBeDefined();
    expect(ghCall!.url).toContain("/repos/acme/widget/issues/7/comments");
    const ghBody = JSON.parse(ghCall!.body) as Record<string, unknown>;
    expect(ghBody.body).toBe("hello");
  });
});

describe("telegram-updates webhook", () => {
  it("rejects requests without the secret token", async () => {
    const env = createEnv();
    const res = await handleTelegramWebhookRequest(
      new Request("https://example.com/telegram/webhook", { method: "POST", body: "{}" }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("accepts requests with the correct secret token", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }));
    const env = createEnv();
    const res = await handleTelegramWebhookRequest(
      new Request("https://example.com/telegram/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "wh-secret" },
        body: JSON.stringify({ update_id: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
