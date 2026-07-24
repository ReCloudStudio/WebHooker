import { Hono } from "hono";
import { getOAuthURL, handleOAuthCallback } from "./github-oauth";
import { removeToken } from "./token-store";
import type { Env } from "./types";

interface PendingState {
  redirectTo: string;
  expiresAt: number;
}

function generateRandomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createOAuthRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/github", async (c) => {
    const redirectTo = c.req.query("redirect") ?? "/";
    const state = generateRandomHex(16);

    const pending: PendingState = {
      redirectTo,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    await c.env.KV.put(`state:${state}`, JSON.stringify(pending), {
      expirationTtl: 600,
    });

    const url = getOAuthURL(c.env.GITHUB_CLIENT_ID ?? "", state);
    return c.redirect(url);
  });

  app.get("/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!code || !state) {
      return c.json({ error: "Missing code or state" }, 400);
    }

    const raw = await c.env.KV.get(`state:${state}`, "json");
    if (!raw) {
      return c.json({ error: "Invalid or expired state" }, 400);
    }
    const pending = raw as PendingState;
    if (Date.now() > pending.expiresAt) {
      await c.env.KV.delete(`state:${state}`);
      return c.json({ error: "Invalid or expired state" }, 400);
    }
    await c.env.KV.delete(`state:${state}`);

    const result = await handleOAuthCallback(
      c.env.GITHUB_CLIENT_ID ?? "",
      c.env.GITHUB_CLIENT_SECRET ?? "",
      code,
      state,
      c.env.KV,
    );

    if (!result) {
      return c.json({ error: "OAuth failed" }, 400);
    }

    return c.json({
      userId: result.userId,
      login: result.login,
      redirectTo: pending.redirectTo,
    });
  });

  app.delete("/token/:userId", async (c) => {
    await removeToken(c.env.KV, c.req.param("userId"));
    return c.json({ ok: true });
  });

  return app;
}
