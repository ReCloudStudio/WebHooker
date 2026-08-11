import { Hono } from "hono";
import type { Env } from "./types";
import { detectProvider } from "./providers";
import { dispatchEvent } from "./core/dispatch";
import { handleInteractionRequest } from "./drivers/discord/interactions";
import { handleTelegramWebhookRequest } from "./drivers/telegram/updates";
import { createOAuthRoutes } from "./web/oauth-routes";
import { createActionRoutes } from "./web/action-routes";
import { createAdminRoutes } from "./web/admin-routes";
import { createLegalRoutes } from "./web/legal-routes";
import { createHomeRoutes } from "./web/home-routes";
import { createRichHeaderRoutes } from "./web/richheader-routes";
import { loadConfig } from "./config";
import { log } from "./lib/log";

const MAX_BODY_SIZE = 1024 * 1024;

export function createServer(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/auth", createOAuthRoutes());
  app.route("/", createActionRoutes());
  app.route("/", createLegalRoutes());
  app.route("/", createHomeRoutes());
  app.route("/admin", createAdminRoutes());
  app.route("/api", createRichHeaderRoutes());

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

    const provider = detectProvider(headers);
    if (!provider) {
      return c.json({ error: "Unknown webhook provider" }, 400);
    }

    if (!(await provider.verify(body, headers, c.env))) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const event = provider.parse(body, headers);
    if (!event) {
      return c.json({ error: "Invalid event" }, 400);
    }

    if (event.deliveryId) {
      const seen = await c.env.KV.get(`delivery:${event.deliveryId}`);
      if (seen) {
        return c.json({ ok: true, duplicate: true });
      }
      await c.env.KV.put(`delivery:${event.deliveryId}`, "1", { expirationTtl: 300 });
    }

    const config = await loadConfig(c.env);
    const dispatch = dispatchEvent(config, event, c.env).catch((err) =>
      log.error(err, "Dispatch failed"),
    );
    c.executionCtx.waitUntil(dispatch);

    return c.json({ ok: true });
  });

  app.post("/discord/interactions", (c) => handleInteractionRequest(c.req.raw, c.env));
  app.post("/telegram/webhook", (c) => handleTelegramWebhookRequest(c.req.raw, c.env));

  app.notFound((c) => {
    if (c.env.ASSETS) {
      // The console SPA (and its _nuxt chunks) lives under /admin; the worker
      // already owns /admin/api, /admin/login|logout|invite. Serve the SPA
      // only for admin-scoped paths — every other unknown URL is a plain 404
      // instead of being swallowed into the console.
      const pathname = new URL(c.req.url).pathname;
      if (
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname.startsWith("/_nuxt/")
      ) {
        return c.env.ASSETS.fetch(c.req.raw);
      }
    }
    return c.json({ error: "Not found" }, 404);
  });

  return app;
}
