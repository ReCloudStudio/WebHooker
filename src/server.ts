import { Hono } from "hono";
import type { Env } from "./types";
import { verifySignature, parseEvent } from "./webhook";
import { dispatchEvent } from "./discord";
import { createOAuthRoutes } from "./oauth-routes";
import { createActionRoutes } from "./action-routes";
import { createAdminRoutes } from "./admin-routes";
import { log } from "./log";

const MAX_BODY_SIZE = 1024 * 1024;

export function createServer(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/auth", createOAuthRoutes());
  app.route("/", createActionRoutes());
  app.route("/admin", createAdminRoutes());

  app.post("/webhook", async (c) => {
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > MAX_BODY_SIZE) {
      return c.json({ error: "Request too large" }, 413);
    }

    const body = await c.req.text();
    if (body.length > MAX_BODY_SIZE) {
      return c.json({ error: "Request too large" }, 413);
    }

    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (
      !(await verifySignature(body, headers["x-hub-signature-256"], c.env.GITHUB_WEBHOOK_SECRET))
    ) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const event = parseEvent(headers, body);
    if (!event) {
      return c.json({ error: "Invalid event" }, 400);
    }

    const { loadConfig } = await import("./config");
    const config = await loadConfig(c.env);
    dispatchEvent(config, event, c.env).catch((err) => log.error(err, "Dispatch failed"));

    return c.json({ ok: true });
  });

  app.notFound((c) => {
    if (c.env.ASSETS) {
      return c.env.ASSETS.fetch(c.req.raw);
    }
    return c.json({ error: "Not found" }, 404);
  });

  return app;
}
