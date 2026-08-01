import { Hono } from "hono";
import type { Env } from "./types";

type Lang = "zh" | "en";

const DEFAULT_REPO = "https://github.com/ReCloudStudio/WebHooker";

function pickLang(raw: string | undefined): Lang {
  return raw === "en" ? "en" : "zh";
}

interface LinkItem {
  href: string;
  label: string;
  desc: string;
  icon: string;
  external: boolean;
  primary?: boolean;
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    docs: '<path d="M4 4a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"/><path d="M13 2v5h5"/><path d="M8 12h8M8 16h6"/>',
    github:
      '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
    terms:
      '<path d="M9 12h6M9 16h6M9 8h2"/><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>',
    privacy:
      '<path d="M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5l7-3z"/><path d="M9 12l2 2 4-4"/>',
    login:
      '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${paths[name] ?? ""}</svg>`;
}

function layout(lang: Lang, repo: string, docs: string): string {
  const t = (zh: string, en: string): string => (lang === "zh" ? zh : en);
  const q = (p: string): string => `${p}?lang=${lang}`;
  const altLang: Lang = lang === "zh" ? "en" : "zh";

  const items: LinkItem[] = [
    {
      href: docs,
      label: t("文档", "Documentation"),
      desc: t("部署、配置与事件参考", "Deployment, configuration & event reference"),
      icon: "docs",
      external: true,
    },
    {
      href: repo,
      label: t("GitHub 仓库", "GitHub Repository"),
      desc: t("源代码、问题与发布", "Source code, issues & releases"),
      icon: "github",
      external: true,
    },
    {
      href: q("/terms"),
      label: t("服务条款", "Terms of Service"),
      desc: t("使用本服务的条款", "The terms for using this service"),
      icon: "terms",
      external: false,
    },
    {
      href: q("/privacy"),
      label: t("隐私政策", "Privacy Policy"),
      desc: t("我们如何处理你的数据", "How we handle your data"),
      icon: "privacy",
      external: false,
    },
    {
      href: "/admin/login",
      label: t("登录控制台", "Sign in to Console"),
      desc: t("管理路由与分组", "Manage routes and groups"),
      icon: "login",
      external: false,
      primary: true,
    },
  ];

  const cards = items
    .map((it) => {
      const attrs = it.external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a class="tile${it.primary ? " tile-primary" : ""}" href="${it.href}"${attrs}>
  <span class="tile-icon">${icon(it.icon)}</span>
  <span class="tile-body">
    <span class="tile-label">${it.label}</span>
    <span class="tile-desc">${it.desc}</span>
  </span>
  <span class="tile-arrow">${it.external ? "↗" : "→"}</span>
</a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<title>WebHooker</title>
<meta name="description" content="${t("GitHub webhook 转发到 Discord", "GitHub webhooks forwarded to Discord")}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --bg:#f6f7f9;--surface:#fff;--surface-2:#f3f4f6;--border:#e6e8ec;--border-strong:#d4d8de;
  --text:#0f172a;--muted:#5b6472;--faint:#9aa3b2;--accent:#4f46e5;--accent-strong:#4338ca;
  --accent-dim:#eef2ff;--accent-text:#3730a3;--shadow:0 1px 3px rgba(15,23,42,.06);
  --dot:rgba(15,23,42,.05);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0b0f17;--surface:#141a24;--surface-2:#1b2330;--border:#232c3a;--border-strong:#33405280;
    --text:#e7ecf3;--muted:#9aa6b6;--faint:#6b7686;--accent:#818cf8;--accent-strong:#a5b4fc;
    --accent-dim:#1e2537;--accent-text:#c7d2fe;--shadow:0 1px 3px rgba(0,0,0,.4);
    --dot:rgba(255,255,255,.05);
  }
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);
  font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
  -webkit-font-smoothing:antialiased;position:relative}
body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:radial-gradient(var(--dot) 1px,transparent 1px);background-size:22px 22px}
.wrap{position:relative;z-index:1;max-width:720px;margin:0 auto;
  padding:72px 20px 64px;display:flex;flex-direction:column;min-height:100vh}
.hero{text-align:center;margin-bottom:40px}
.mark{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;
  border-radius:16px;background:var(--accent);color:#fff;font-weight:800;font-size:20px;
  letter-spacing:-.02em;margin-bottom:20px;box-shadow:0 8px 24px -8px var(--accent)}
h1{font-size:34px;margin:0 0 10px;letter-spacing:-.03em;font-weight:800}
h1 span{color:var(--accent)}
.sub{color:var(--muted);font-size:15px;margin:0;line-height:1.6}
.grid{display:grid;gap:12px}
.tile{display:flex;align-items:center;gap:16px;text-decoration:none;
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:18px 20px;color:var(--text);transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;
  box-shadow:var(--shadow)}
.tile:hover{transform:translateY(-2px);border-color:var(--border-strong);box-shadow:0 8px 24px -12px rgba(15,23,42,.25)}
.tile-icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex:none;
  border-radius:11px;background:var(--surface-2);color:var(--accent)}
.tile-body{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.tile-label{font-weight:700;font-size:15px}
.tile-desc{color:var(--muted);font-size:13px}
.tile-arrow{color:var(--faint);font-size:18px;flex:none}
.tile-primary{background:var(--accent);border-color:var(--accent)}
.tile-primary .tile-label,.tile-primary .tile-desc,.tile-primary .tile-arrow{color:#fff}
.tile-primary .tile-desc{color:rgba(255,255,255,.82)}
.tile-primary .tile-icon{background:rgba(255,255,255,.16);color:#fff}
.tile-primary:hover{box-shadow:0 12px 28px -10px var(--accent)}
footer{margin-top:auto;padding-top:40px;display:flex;justify-content:space-between;
  align-items:center;gap:12px;flex-wrap:wrap}
.muted{color:var(--muted);font-size:13px}
.langlink{font-size:13px;text-decoration:none;color:var(--muted);
  border:1px solid var(--border);border-radius:999px;padding:6px 14px;background:var(--surface)}
.langlink:hover{color:var(--text);border-color:var(--border-strong)}
</style>
</head>
<body>
<div class="wrap">
<div class="hero">
<div class="mark">WH</div>
<h1>Web<span>Hooker</span></h1>
<p class="sub">${t(
    "将 GitHub webhook 事件转发到 Discord 频道，并支持在 Discord 中以你本人身份操作 GitHub。",
    "Forward GitHub webhook events to Discord, and act on GitHub from Discord as yourself.",
  )}</p>
</div>
<nav class="grid">
${cards}
</nav>
<footer>
<span class="muted">WebHooker · GitHub → Discord</span>
<a class="langlink" href="/?lang=${altLang}">${t("English", "中文")}</a>
</footer>
</div>
</body>
</html>`;
}

export function createHomeRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", (c) => {
    const lang = pickLang(c.req.query("lang"));
    const repo = c.env.GITHUB_REPO_URL ?? DEFAULT_REPO;
    const docs = c.env.DOCS_URL ?? `${repo}#readme`;
    return c.html(layout(lang, repo, docs));
  });

  return app;
}
