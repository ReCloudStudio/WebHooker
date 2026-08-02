import { Hono } from "hono";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createRichHeaderRoutes(): Hono {
  const app = new Hono();

  app.get("/richheader", (c) => {
    const title = c.req.query("title") ?? "";
    const content = c.req.query("content") ?? "";
    const avatar = c.req.query("avatar") ?? "";

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta property="og:type"  content="website">
  <meta property="og:site_name" content="${esc(title)}">
  ${content ? `<meta property="og:title" content="${esc(content)}">` : ""}
  ${avatar ? `<meta property="og:image" content="${esc(avatar)}">` : ""}
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px; max-width: 600px; margin: 0 auto;">
    ${avatar ? `<img src="${esc(avatar)}" alt="Avatar" style="width: 128px; height: 128px; border-radius: 50%; margin-bottom: 20px;">` : ""}
    ${title ? `<h1 style="margin: 0 0 10px 0; color: #333;">${esc(title)}</h1>` : ""}
    ${content ? `<p style="margin: 0; color: #666;">${esc(content)}</p>` : ""}
    <p style="margin-top: 40px; font-size: 14px; color: #999;">This page is used for Open Graph meta tags (richheader) only.</p>
</body>
</html>`;

    return c.html(html);
  });

  return app;
}
