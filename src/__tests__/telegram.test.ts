import { describe, it, expect, afterEach } from "bun:test";
import { sendMessage } from "../drivers/telegram/rest";
import { renderNeutralMessage } from "../drivers/telegram/render";
import type { NeutralMessage } from "../types";

function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    Promise.resolve(handler(String(input), init));
}

const restoredFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = restoredFetch;
});

describe("telegram renderNeutralMessage", () => {
  it("renders title, fields and footer as HTML", () => {
    const message: NeutralMessage = {
      title: "acme/widget: Add feature",
      url: "https://github.com/acme/widget",
      fields: [{ name: "Status", value: "success" }],
      footer: "acme/widget",
    };
    const out = renderNeutralMessage(message);
    expect(out).toContain(
      '<b><a href="https://github.com/acme/widget">acme/widget: Add feature</a></b>',
    );
    expect(out).toContain("<b>Status</b>: success");
    expect(out).toContain("<i>acme/widget</i>");
  });

  it("escapes HTML special characters", () => {
    const out = renderNeutralMessage({
      title: 'a <b> & "c"',
      fields: [{ name: "body", value: "<script>alert(1)</script>" }],
    });
    expect(out).not.toContain("<b>acme");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("telegram-rest sendMessage", () => {
  it("posts to the bot API with chat_id and parse_mode", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    mockFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
        status: 200,
      });
    });

    const result = await sendMessage("token-abc", "-100123", "hello");

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("42");
    expect(capturedUrl).toBe("https://api.telegram.org/bottoken-abc/sendMessage");
    const body = JSON.parse(String(capturedInit!.body)) as Record<string, unknown>;
    expect(body.chat_id).toBe("-100123");
    expect(body.parse_mode).toBe("HTML");
    expect(body.message_thread_id).toBeUndefined();
  });

  it("includes message_thread_id when topicId is given", async () => {
    let capturedInit: RequestInit | undefined;
    mockFetch((_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
      });
    });

    await sendMessage("t", "-100123", "hello", "999");
    const body = JSON.parse(String(capturedInit!.body)) as Record<string, unknown>;
    expect(body.message_thread_id).toBe(999);
  });

  it("returns error on non-ok response", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 }),
    );
    const result = await sendMessage("t", "-100123", "hello");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("chat not found");
  });

  it("returns error when token is missing", async () => {
    const result = await sendMessage("", "-100123", "hello");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("NO_TOKEN");
  });
});
