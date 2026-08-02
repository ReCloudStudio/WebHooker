import { Hono } from "hono";
import type { Env } from "./types";

type Lang = "zh" | "en";

const CONTACT_FALLBACK = "the repository maintainer (open an issue on the project repository)";
const CONTACT_FALLBACK_ZH = "项目维护者（在项目仓库提交 issue）";

function pickLang(raw: string | undefined): Lang {
  return raw === "en" ? "en" : "zh";
}

function layout(opts: {
  lang: Lang;
  active: "terms" | "privacy";
  title: string;
  updated: string;
  body: string;
}): string {
  const { lang, active, title, updated, body } = opts;
  const altLang: Lang = lang === "zh" ? "en" : "zh";
  const t = (zh: string, en: string): string => (lang === "zh" ? zh : en);
  const q = (p: string): string => `${p}?lang=${lang}`;
  const langLabel = t("English", "中文");
  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<title>${title} · WebHooker</title>
<style>
:root{--bg:#f6f7f9;--surface:#fff;--border:#e5e7eb;--text:#1f2328;--muted:#57606a;--accent:#4f46e5;--body-text:#30363d;--code-bg:#f0f1f3;--accent-dim:#eef2ff;--accent-border:#e0e7ff;--shadow:rgba(0,0,0,.05)}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f17;--surface:#131a24;--border:#273143;--text:#e6e9ef;--muted:#9aa6b8;--accent:#818cf8;--body-text:#c3cad6;--code-bg:#1a2230;--accent-dim:#1c2140;--accent-border:#2f3766;--shadow:rgba(0,0,0,.5);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:48px 20px 80px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px;flex-wrap:wrap}
.brand{font-weight:800;font-size:16px;letter-spacing:-.01em;text-decoration:none;color:var(--text)}
.brand span{color:var(--accent)}
.tabs{display:flex;gap:8px}
.tab{font-size:13px;text-decoration:none;color:var(--muted);padding:6px 14px;border-radius:999px;border:1px solid transparent}
.tab.active{color:var(--accent);background:var(--accent-dim);border-color:var(--accent-border)}
.tab:hover{color:var(--text)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:36px 40px;box-shadow:0 1px 3px var(--shadow)}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
.updated{color:var(--muted);font-size:13px;margin:0 0 24px}
h2{font-size:17px;margin:28px 0 8px}
p,li{color:var(--body-text);font-size:15px}
a{color:var(--accent)}
ul{padding-left:20px}
code{background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:1px 6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px}
footer{margin-top:24px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.langlink{font-size:13px;text-decoration:none;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:6px 14px;background:var(--surface)}
.langlink:hover{color:var(--text)}
.muted{color:var(--muted);font-size:13px}
</style>
</head>
<body>
<div class="wrap">
<header>
<a class="brand" href="${q("/terms")}">Web<span>Hooker</span></a>
<nav class="tabs">
<a class="tab ${active === "terms" ? "active" : ""}" href="${q("/terms")}">${t("服务条款", "Terms")}</a>
<a class="tab ${active === "privacy" ? "active" : ""}" href="${q("/privacy")}">${t("隐私政策", "Privacy")}</a>
</nav>
</header>
<article class="card">
<h1>${title}</h1>
<p class="updated">${t("最后更新", "Last updated")}: ${updated}</p>
${body}
</article>
<footer>
<span class="muted">WebHooker · GitHub → Discord</span>
<a class="langlink" href="${q(active === "terms" ? "/terms" : "/privacy").replace(`lang=${lang}`, `lang=${altLang}`)}">${langLabel}</a>
</footer>
</div>
</body>
</html>`;
}

function termsBody(lang: Lang, contact: string): string {
  if (lang === "en") {
    return `
<p>These Terms of Service ("Terms") govern your use of the WebHooker Discord application and bot ("the Service"), which forwards GitHub webhook events to Discord channels and lets you comment on GitHub from Discord using your own linked GitHub account.</p>
<h2>1. Acceptance</h2>
<p>By adding the bot to a Discord server, using its slash commands, or linking your GitHub account, you agree to these Terms. If you do not agree, do not use the Service.</p>
<h2>2. The Service</h2>
<ul>
<li>Delivers GitHub repository notifications to configured Discord channels.</li>
<li>Provides <code>/gh</code> commands to link a GitHub account and to create, edit, or delete GitHub issue/PR comments as that linked account.</li>
<li>All GitHub write actions are performed with your own OAuth authorization and are subject to your GitHub permissions and to GitHub's Terms of Service.</li>
</ul>
<h2>3. Acceptable Use</h2>
<ul>
<li>Do not use the Service to post spam, harassment, or unlawful content.</li>
<li>Do not attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the Service.</li>
<li>You are responsible for all activity performed through your linked account.</li>
</ul>
<h2>4. Account Linking &amp; Revocation</h2>
<p>Linking is optional and initiated by you via <code>/gh login</code>. You may unlink at any time with <code>/gh logout</code>, or revoke access from your GitHub account settings under authorized OAuth applications.</p>
<h2>5. Availability &amp; Warranty</h2>
<p>The Service is provided "as is" and "as available", without warranties of any kind. It may be modified, suspended, or discontinued at any time without notice.</p>
<h2>6. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, the operator shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
<h2>7. Changes</h2>
<p>These Terms may be updated. Continued use after changes constitutes acceptance of the revised Terms.</p>
<h2>8. Contact</h2>
<p>Questions about these Terms can be directed to ${contact}.</p>`;
  }
  return `
<p>本《服务条款》（下称"条款"）适用于你对 WebHooker Discord 应用与机器人（下称"本服务"）的使用。本服务用于将 GitHub 的 webhook 事件转发到 Discord 频道，并允许你在 Discord 中以你本人绑定的 GitHub 账号对 GitHub 进行评论。</p>
<h2>1. 接受条款</h2>
<p>当你将机器人添加到 Discord 服务器、使用其斜杠命令，或绑定你的 GitHub 账号时，即表示你同意本条款。如不同意，请勿使用本服务。</p>
<h2>2. 服务内容</h2>
<ul>
<li>将 GitHub 仓库通知投递到已配置的 Discord 频道。</li>
<li>提供 <code>/gh</code> 命令用于绑定 GitHub 账号，并以该绑定账号创建、编辑或删除 GitHub issue/PR 评论。</li>
<li>所有对 GitHub 的写入操作均使用你本人的 OAuth 授权执行，受你的 GitHub 权限以及 GitHub 服务条款约束。</li>
</ul>
<h2>3. 可接受使用</h2>
<ul>
<li>不得利用本服务发布垃圾信息、骚扰或违法内容。</li>
<li>不得试图干扰、超载、逆向工程或未经授权访问本服务。</li>
<li>你对通过绑定账号执行的一切操作负责。</li>
</ul>
<h2>4. 账号绑定与解除</h2>
<p>绑定为可选，由你通过 <code>/gh login</code> 主动发起。你可随时使用 <code>/gh logout</code> 解除绑定，或在 GitHub 账号设置的已授权 OAuth 应用中撤销授权。</p>
<h2>5. 可用性与免责声明</h2>
<p>本服务按"现状"和"现有可用"基础提供，不作任何形式的保证。服务可能随时被修改、暂停或终止，恕不另行通知。</p>
<h2>6. 责任限制</h2>
<p>在法律允许的最大范围内，运营者对因使用本服务而产生的任何间接、附带或后果性损害不承担责任。</p>
<h2>7. 条款变更</h2>
<p>本条款可能会更新。变更后继续使用即视为接受修订后的条款。</p>
<h2>8. 联系方式</h2>
<p>关于本条款的问题可联系${contact}。</p>`;
}

function privacyBody(lang: Lang, contact: string): string {
  if (lang === "en") {
    return `
<p>This Privacy Policy explains what data the WebHooker Discord application ("the Service") processes, why, and how it is stored.</p>
<h2>1. Data We Process</h2>
<ul>
<li><b>Discord identifiers</b>: your Discord user ID, only when you run <code>/gh login</code>, to link you to a GitHub account.</li>
<li><b>GitHub OAuth tokens</b>: an access token (and refresh token, if provided) issued when you authorize the app, used to act on GitHub on your behalf.</li>
<li><b>GitHub account info</b>: your GitHub user ID and login name, returned during authorization.</li>
<li><b>Webhook payloads</b>: GitHub event data is received and forwarded to Discord. It is processed in transit and is not stored beyond short-lived delivery de-duplication keys.</li>
<li><b>Operational logs</b>: minimal send/delivery records kept temporarily for troubleshooting.</li>
</ul>
<h2>2. How Data Is Stored</h2>
<ul>
<li>Data is stored in Cloudflare Workers KV within the operator's Cloudflare account.</li>
<li>Delivery de-duplication keys expire automatically (about 5 minutes).</li>
<li>Send logs expire automatically (about 1 hour).</li>
<li>OAuth tokens persist until you unlink or the token expires/is revoked.</li>
</ul>
<h2>3. How Data Is Used</h2>
<p>Solely to operate the Service: forwarding notifications and performing GitHub actions (comment create/edit/delete) that you explicitly request. We do not sell your data or use it for advertising.</p>
<h2>4. Sharing</h2>
<p>Data is shared only with the platforms required to deliver the Service — GitHub and Discord — through their official APIs, and with Cloudflare as the hosting/storage provider. No other third-party sharing occurs.</p>
<h2>5. Your Choices</h2>
<ul>
<li>Run <code>/gh logout</code> to delete the Discord-to-GitHub link.</li>
<li>Revoke the OAuth authorization from your GitHub settings (Applications → Authorized OAuth Apps) to invalidate stored tokens.</li>
<li>Remove the bot from a server to stop notification delivery.</li>
</ul>
<h2>6. Data Retention</h2>
<p>We retain data only as long as needed for the Service. Transient data expires automatically as described above; account links and tokens are removed when you unlink or revoke access.</p>
<h2>7. Children</h2>
<p>The Service is not directed to individuals under the age required by Discord's Terms of Service, and we do not knowingly collect their data.</p>
<h2>8. Changes</h2>
<p>This policy may be updated. Material changes will be reflected by the "Last updated" date above.</p>
<h2>9. Contact</h2>
<p>For privacy questions or data-removal requests, contact ${contact}.</p>`;
  }
  return `
<p>本《隐私政策》说明 WebHooker Discord 应用（下称"本服务"）处理哪些数据、为何处理以及如何存储。</p>
<h2>1. 我们处理的数据</h2>
<ul>
<li><b>Discord 标识</b>：仅在你执行 <code>/gh login</code> 时收集你的 Discord 用户 ID，用于将你与 GitHub 账号绑定。</li>
<li><b>GitHub OAuth 令牌</b>：在你授权应用时签发的访问令牌（如提供，还包括刷新令牌），用于代表你在 GitHub 上执行操作。</li>
<li><b>GitHub 账号信息</b>：授权过程中返回的 GitHub 用户 ID 和登录名。</li>
<li><b>Webhook 负载</b>：接收 GitHub 事件数据并转发到 Discord，仅在传输过程中处理，除短期的投递去重键外不作留存。</li>
<li><b>运行日志</b>：为便于排障而临时保留的极少量发送/投递记录。</li>
</ul>
<h2>2. 数据如何存储</h2>
<ul>
<li>数据存储于运营者 Cloudflare 账号下的 Cloudflare Workers KV 中。</li>
<li>投递去重键自动过期（约 5 分钟）。</li>
<li>发送日志自动过期（约 1 小时）。</li>
<li>OAuth 令牌在你解除绑定或令牌过期/被撤销前持续保留。</li>
</ul>
<h2>3. 数据如何使用</h2>
<p>仅用于运行本服务：转发通知，以及执行你明确请求的 GitHub 操作（评论的创建/编辑/删除）。我们不出售你的数据，也不用于广告。</p>
<h2>4. 数据共享</h2>
<p>数据仅通过官方 API 与提供本服务所必需的平台共享——即 GitHub 与 Discord——以及作为托管/存储提供方的 Cloudflare。不存在其他第三方共享。</p>
<h2>5. 你的选择</h2>
<ul>
<li>执行 <code>/gh logout</code> 删除 Discord 与 GitHub 的绑定。</li>
<li>在 GitHub 设置（Applications → Authorized OAuth Apps）中撤销 OAuth 授权，使已存令牌失效。</li>
<li>将机器人移出服务器以停止通知投递。</li>
</ul>
<h2>6. 数据留存</h2>
<p>我们仅在提供本服务所需的期间内保留数据。临时数据按上文自动过期；账号绑定与令牌在你解除绑定或撤销授权时被删除。</p>
<h2>7. 未成年人</h2>
<p>本服务不面向低于 Discord 服务条款所要求年龄的个人，我们也不会有意收集其数据。</p>
<h2>8. 政策变更</h2>
<p>本政策可能会更新。重大变更将通过上方"最后更新"日期体现。</p>
<h2>9. 联系方式</h2>
<p>如有隐私问题或数据删除请求，请联系${contact}。</p>`;
}

const UPDATED = "2026-08-01";

export function createLegalRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/terms", (c) => {
    const lang = pickLang(c.req.query("lang"));
    const contact = c.env.LEGAL_CONTACT ?? (lang === "zh" ? CONTACT_FALLBACK_ZH : CONTACT_FALLBACK);
    return c.html(
      layout({
        lang,
        active: "terms",
        title: lang === "zh" ? "服务条款" : "Terms of Service",
        updated: UPDATED,
        body: termsBody(lang, contact),
      }),
    );
  });

  app.get("/privacy", (c) => {
    const lang = pickLang(c.req.query("lang"));
    const contact = c.env.LEGAL_CONTACT ?? (lang === "zh" ? CONTACT_FALLBACK_ZH : CONTACT_FALLBACK);
    return c.html(
      layout({
        lang,
        active: "privacy",
        title: lang === "zh" ? "隐私政策" : "Privacy Policy",
        updated: UPDATED,
        body: privacyBody(lang, contact),
      }),
    );
  });

  return app;
}
