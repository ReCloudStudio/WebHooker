import { Hono } from "hono";
import { getOAuthURL, handleOAuthCallback } from "../github/oauth";
import { removeToken, saveDiscordLink, saveTelegramLink } from "../github/store";
import { createAdminSession, adminCookie } from "./session";
import { loadGroups, resolveScope, hasAnyAccess } from "./groups";
import { sendMessage } from "../drivers/telegram/rest";
import type { Env } from "../types";

interface PendingState {
  redirectTo: string;
  expiresAt: number;
  discordUserId?: string;
  telegramUserId?: string;
  telegramChatId?: string;
}

function linkedPage(login: string): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>绑定成功</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f7f9;color:#1f2328}.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 40px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}.ok{color:#16a34a;font-size:40px}h1{font-size:18px;margin:12px 0 4px}p{color:#57606a;font-size:14px;margin:0}</style></head><body><div class="card"><div class="ok">✓</div><h1>GitHub 账号已绑定</h1><p>已连接为 <b>@${login}</b>，现在可以回到 Discord 用 GitHub 评论了。</p></div></body></html>`;
}

function generateRandomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeRedirectPath(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (/^\/\\/.test(value)) return "/";
  return value;
}

export function createOAuthRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/github", async (c) => {
    const redirectTo = safeRedirectPath(c.req.query("redirect"));
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

    // Discord account-linking flow: bind the Discord user to this GitHub account.
    if (pending.discordUserId) {
      await saveDiscordLink(c.env.DB, pending.discordUserId, result.userId);
      const isBrowserLink = (c.req.header("accept") ?? "").includes("text/html");
      if (isBrowserLink) {
        return c.html(linkedPage(result.login));
      }
      return c.json({ ok: true, discordUserId: pending.discordUserId, login: result.login });
    }

    // Telegram account-linking flow: bind the Telegram user to this GitHub account.
    if (pending.telegramUserId) {
      await saveTelegramLink(c.env.DB, pending.telegramUserId, result.userId);
      if (pending.telegramChatId && c.env.TELEGRAM_TOKEN) {
        await sendMessage(
          c.env.TELEGRAM_TOKEN,
          pending.telegramChatId,
          `✅ GitHub 账号已绑定：**@${result.login}**。现在可以用 /gh comment 评论了。`,
        ).catch(() => undefined);
      }
      return c.json({ ok: true, telegramUserId: pending.telegramUserId, login: result.login });
    }

    const isBrowser = (c.req.header("accept") ?? "").includes("text/html");
    if (isBrowser) {
      const groups = await loadGroups(c.env.KV);
      const scope = resolveScope(c.env, groups, result.userId, result.login);
      if (!hasAnyAccess(scope)) {
        return c.redirect("/admin?error=forbidden");
      }
      const sessionId = await createAdminSession(c.env.KV, result.userId, result.login);
      c.header("Set-Cookie", adminCookie(sessionId));
      return c.redirect(pending.redirectTo);
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
