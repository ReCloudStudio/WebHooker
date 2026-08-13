import { Hono } from "hono";
import { getOAuthURL, handleOAuthCallback, getInstallationAccount } from "../github/oauth";
import { removeToken, saveDiscordLink, saveTelegramLink } from "../github/store";
import { createAdminSession, adminCookie, getAdminSession } from "./session";
import {
  loadGroups,
  saveGroups,
  resolveScope,
  hasAnyAccess,
  ensureInstallationGroup,
  normalizeGroupMembers,
  roleAt,
} from "./groups";
import { clientIp } from "./auth";
import { recordAudit } from "../lib/audit";
import { sendMessage } from "../drivers/telegram/rest";
import type { Env, Group } from "../types";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selfSignupEnabled(env: Env): boolean {
  const flag = (env.ALLOW_SELF_SIGNUP ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/**
 * Opt-in self service: users without any group access get a personal group
 * they own, so they can configure their own routing without a super admin.
 * The group id is deterministic (`u-{userId}`), so it is created at most once.
 */
async function ensurePersonalGroup(env: Env, userId: string, login: string): Promise<boolean> {
  if (!selfSignupEnabled(env)) return false;
  const groups = await loadGroups(env.KV);
  const gid = `u-${userId}`;
  if (groups.some((g) => g.id === gid)) return true;
  const personal: Group = {
    id: gid,
    name: `@${login}`,
    members: [{ login, role: "owner" }],
    adminIds: [login],
  };
  await saveGroups(env.KV, [...groups, personal]);
  await recordAudit(env.DB, {
    ts: Date.now(),
    actorId: userId,
    actorLogin: login,
    action: "group.create",
    targetType: "group",
    targetId: gid,
    groupId: gid,
    detail: { auto: true },
  });
  return true;
}

/**
 * Post-install choice page: pick which group the installation binds to.
 * Options are the groups the signed-in user owns (role `owner`), plus a
 * default "create a new group" choice.
 */
function installPage(opts: {
  installationId: number;
  accountLogin: string;
  owned: Group[];
}): string {
  const { installationId, accountLogin, owned } = opts;
  const accountLine = accountLogin
    ? `<p>账号：<b>${escapeHtml(accountLogin)}</b>（安装 ID <code>${installationId}</code>）</p>`
    : `<p>安装 ID：<code>${installationId}</code></p>`;
  const ownedOptions = owned
    .map(
      (g) =>
        `<label class="opt"><input type="radio" name="group" value="${escapeHtml(g.id)}"><span><b>${escapeHtml(g.name)}</b> <code>${escapeHtml(g.id)}</code></span></label>`,
    )
    .join("");
  const ownedNote = owned.length
    ? '<p class="hint">也可以选择绑定到你有 owner 权限的已有分组：</p>'
    : "";
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安装 GitHub App</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f7f9;color:#1f2328}.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;width:min(480px,92vw);box-shadow:0 1px 3px rgba(0,0,0,.06)}h1{font-size:17px;margin:0 0 4px}p{color:#57606a;font-size:13.5px;margin:6px 0}code{background:#f0f1f3;border-radius:4px;padding:1px 5px;font-size:12.5px}.opt{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border:1px solid #e5e7eb;border-radius:8px;margin-top:8px;cursor:pointer}.opt:hover{background:#fafbfc}.hint{font-size:12.5px;color:#8b949e;margin-top:10px}.btn{display:inline-block;margin-top:14px;background:#1f2328;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer}.btn:hover{background:#32383f}.skip{margin-left:12px;color:#8b949e;font-size:13px;text-decoration:none}</style></head><body><div class="card"><h1>GitHub App 安装成功</h1>${accountLine}<p>将安装绑定到哪个分组？建议直接创建新分组，之后可以在控制台添加路由与成员。</p><form method="post" action="/auth/github/install/bind"><input type="hidden" name="installation_id" value="${installationId}"><label class="opt"><input type="radio" name="group" value="" checked><span><b>创建新分组</b> <code>inst-${installationId}</code></span></label>${ownedNote}${ownedOptions}<button class="btn" type="submit">确定</button></form></div></body></html>`;
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

  /**
   * GitHub App post-install redirect: the App's "Setup URL" points here, so
   * the browser lands on this route right after a user installs the App on an
   * org/user — before any webhook event arrives. The user picks which group
   * the installation binds to (an existing group they own, or a new
   * auto-created `inst-{id}` group); the actual provisioning happens on
   * `POST /auth/github/install/bind`.
   */
  app.get("/github/install", async (c) => {
    const rawId = c.req.query("installation_id");
    const installationId = Number(rawId);
    if (!rawId || !Number.isInteger(installationId) || installationId <= 0) {
      return c.json({ error: "Missing installation_id" }, 400);
    }
    const session = await getAdminSession(c.env.KV, c.req.header("cookie"));
    if (!session) {
      const target = `/auth/github/install?installation_id=${installationId}`;
      return c.redirect(`/auth/github?redirect=${encodeURIComponent(target)}`);
    }

    const accountLogin =
      (await getInstallationAccount(
        c.env.GITHUB_APP_ID ?? "",
        c.env.GITHUB_PRIVATE_KEY ?? "",
        installationId,
      )) ?? "";
    const groups = await loadGroups(c.env.KV);
    const scope = resolveScope(c.env, groups, session.userId, session.login);
    const owned = groups.filter((g) => roleAt(scope, g.id) === "owner");

    return c.html(installPage({ installationId, accountLogin, owned }));
  });

  app.post("/github/install/bind", async (c) => {
    const session = await getAdminSession(c.env.KV, c.req.header("cookie"));
    if (!session) {
      return c.redirect("/admin?error=forbidden");
    }
    const body = await c.req.parseBody();
    const rawId = String(body["installation_id"] ?? "");
    const installationId = Number(rawId);
    if (!Number.isInteger(installationId) || installationId <= 0) {
      return c.json({ error: "Missing installation_id" }, 400);
    }
    const chosenGroupId = String(body["group"] ?? "").trim();
    const groups = await loadGroups(c.env.KV);
    const scope = resolveScope(c.env, groups, session.userId, session.login);

    const bind = async (groupId: string, group: Group | null): Promise<Response> => {
      if (!group) {
        return c.redirect("/admin?error=install");
      }
      const next = groups.map((g) => (g.id === group.id ? { ...g, installationId } : g));
      await saveGroups(c.env.KV, next);
      await recordAudit(c.env.DB, {
        ts: Date.now(),
        actorId: session.userId,
        actorLogin: session.login,
        action: "installation.bind",
        targetType: "group",
        targetId: groupId,
        groupId,
        detail: { installationId },
        ip: clientIp(c),
      });
      return c.redirect("/admin?install=ok");
    };

    if (chosenGroupId) {
      // Binding to an existing group requires owner permission on it.
      const group = groups.find((g) => g.id === chosenGroupId);
      if (!group || roleAt(scope, chosenGroupId) !== "owner") {
        return c.redirect("/admin?error=forbidden");
      }
      return bind(chosenGroupId, group);
    }

    // Default: auto-create a dedicated inst-{id} group.
    const accountLogin =
      (await getInstallationAccount(
        c.env.GITHUB_APP_ID ?? "",
        c.env.GITHUB_PRIVATE_KEY ?? "",
        installationId,
      )) ?? "";
    const group = await ensureInstallationGroup(c.env.KV, installationId, accountLogin);
    if (!group) {
      return c.redirect("/admin?error=install");
    }
    await recordAudit(c.env.DB, {
      ts: Date.now(),
      actorId: session.userId,
      actorLogin: session.login,
      action: "installation.created",
      targetType: "group",
      targetId: group.id,
      groupId: group.id,
      detail: { source: "setup_url", account: accountLogin || undefined },
      ip: clientIp(c),
    });

    // Self-service SaaS: the installer manages their own auto-created group.
    if (selfSignupEnabled(c.env)) {
      const members = normalizeGroupMembers(group);
      const alreadyMember = members.some(
        (m) => m.login.toLowerCase() === session.login.toLowerCase() || m.login === session.userId,
      );
      if (!alreadyMember) {
        const updated: Group = {
          ...group,
          members: [...members, { login: session.login, role: "owner" }],
          adminIds: [...new Set([...(group.adminIds ?? []), session.login])],
        };
        const all = await loadGroups(c.env.KV);
        await saveGroups(
          c.env.KV,
          all.map((g) => (g.id === group.id ? updated : g)),
        );
        await recordAudit(c.env.DB, {
          ts: Date.now(),
          actorId: session.userId,
          actorLogin: session.login,
          action: "group.member.add",
          targetType: "group",
          targetId: group.id,
          groupId: group.id,
          detail: { login: session.login, role: "owner", auto: true },
          ip: clientIp(c),
        });
      }
    }

    return c.redirect("/admin?install=ok");
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
      // Invite accept flow: the redirect target is the invite page, which
      // processes the token after the session exists. Skip the access gate so
      // non-members can get in and accept.
      const isInviteFlow =
        pending.redirectTo.startsWith("/admin/invite") ||
        pending.redirectTo.startsWith("/admin/invite?");

      let groups = await loadGroups(c.env.KV);
      let scope = resolveScope(c.env, groups, result.userId, result.login);

      if (!hasAnyAccess(scope) && !isInviteFlow) {
        const created = await ensurePersonalGroup(c.env, result.userId, result.login);
        if (created) {
          groups = await loadGroups(c.env.KV);
          scope = resolveScope(c.env, groups, result.userId, result.login);
        }
      }
      if (!hasAnyAccess(scope) && !isInviteFlow) {
        return c.redirect("/admin?error=forbidden");
      }

      const sessionId = await createAdminSession(c.env.KV, result.userId, result.login);
      c.header("Set-Cookie", adminCookie(sessionId));
      await recordAudit(c.env.DB, {
        ts: Date.now(),
        actorId: result.userId,
        actorLogin: result.login,
        action: "session.login",
        ip: clientIp(c),
      });
      return c.redirect(pending.redirectTo);
    }

    return c.json({
      userId: result.userId,
      login: result.login,
      redirectTo: pending.redirectTo,
    });
  });

  app.delete("/token/:userId", async (c) => {
    const session = await getAdminSession(c.env.KV, c.req.header("Cookie"));
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const target = c.req.param("userId");
    await removeToken(c.env.KV, target);
    await recordAudit(c.env.DB, {
      ts: Date.now(),
      actorId: session.userId,
      actorLogin: session.login,
      action: "token.delete",
      targetType: "token",
      targetId: target,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

  return app;
}
