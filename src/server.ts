import { Hono } from "hono";
import type { Env } from "./types";
import { verifySignature, parseEvent } from "./webhook";
import { dispatchEvent } from "./discord";
import { createOAuthRoutes } from "./oauth-routes";
import { createActionRoutes } from "./action-routes";
import { createAdminRoutes } from "./admin-routes";
import { createLegalRoutes } from "./legal-routes";
import { createHomeRoutes } from "./home-routes";
import { loadConfig } from "./config";
import { log } from "./log";

const MAX_BODY_SIZE = 1024 * 1024;

export function createServer(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/auth", createOAuthRoutes());
  app.route("/", createActionRoutes());
  app.route("/", createLegalRoutes());
  app.route("/", createHomeRoutes());
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

    const delivery = headers["x-github-delivery"];
    if (delivery) {
      const seen = await c.env.KV.get(`delivery:${delivery}`);
      if (seen) {
        return c.json({ ok: true, duplicate: true });
      }
      await c.env.KV.put(`delivery:${delivery}`, "1", { expirationTtl: 300 });
    }

    const config = await loadConfig(c.env);
    const dispatch = dispatchEvent(config, event, c.env).catch((err) =>
      log.error(err, "Dispatch failed"),
    );
    c.executionCtx.waitUntil(dispatch);

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
