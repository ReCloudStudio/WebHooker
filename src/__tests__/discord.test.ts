import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sendMessage } from "../discord-rest";
import { isGatewayEnabled } from "../discord";
import type { Env } from "../types";

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
