import { describe, it, expect } from "bun:test";
import type { Env } from "../server/lib/types";
import { verifyFeishuSignature, handleFeishuWebhookRequest } from "../server/lib/drivers/feishu/updates";

function sign(secret: string, timestamp: string, nonce: string, body: string): Promise<string> {
  return (async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}\n${nonce}\n${body}`));
    let binary = "";
    const bytes = new Uint8Array(sig);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
    return btoa(binary);
  })();
}

const stubKV = {
  get: async () => null,
  put: async () => undefined,
  delete: async () => undefined,
} as unknown as KVNamespace<string>;
const stubDB = {} as unknown as D1Database;
const stubEnv: Env = {
  GITHUB_WEBHOOK_SECRET: "",
  FEISHU_APP_ID: "",
  FEISHU_APP_SECRET: "",
  KV: stubKV,
  DB: stubDB,
};

describe("feishu signature", () => {
  it("verifies a correct signature", async () => {
    const secret = "s3cr3t";
    const ts = "1700000000";
    const nonce = "abc";
    const body = JSON.stringify({ hello: "world" });
    const sig = await sign(secret, ts, nonce, body);
    expect(await verifyFeishuSignature(secret, ts, nonce, body, sig)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const secret = "s3cr3t";
    const body = JSON.stringify({ hello: "world" });
    const sig = await sign("other", "1", "2", body);
    expect(await verifyFeishuSignature(secret, "1", "2", body, sig)).toBe(false);
  });
});

describe("feishu webhook", () => {
  it("answers the url_verification challenge", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "xyz123" });
    const req = new Request("https://x/feishu/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const res = await handleFeishuWebhookRequest(req, stubEnv);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.challenge).toBe("xyz123");
  });

  it("rejects a bad signature with 401 when a secret is configured", async () => {
    const env = { ...stubEnv, FEISHU_APP_SECRET: "s3cr3t" };
    const body = JSON.stringify({ type: "other", challenge: "x" });
    const req = new Request("https://x/feishu/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lark-signature": "deadbeef" },
      body,
    });
    const res = await handleFeishuWebhookRequest(req, env);
    expect(res.status).toBe(401);
  });
});
