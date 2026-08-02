import { Hono } from "hono";
import { getUserOctokit } from "./github-oauth";
import { findUserIdByToken } from "./token-store";
import type { Env } from "./types";

function extractBearerToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export function createActionRoutes(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/api/comment", async (c) => {
    const token = extractBearerToken(c);
    if (!token) return c.json({ error: "Missing authorization" }, 401);
    const userId = await findUserIdByToken(c.env.KV, token);
    if (!userId) return c.json({ error: "Invalid or expired token" }, 401);

    const body = await c.req.json<{
      owner: string;
      repo: string;
      issueNumber: number;
      body: string;
    }>();
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    await octokit.rest.issues.createComment({
      owner: body.owner,
      repo: body.repo,
      issue_number: body.issueNumber,
      body: body.body,
    });

    return c.json({ ok: true });
  });

  app.post("/api/merge", async (c) => {
    const token = extractBearerToken(c);
    if (!token) return c.json({ error: "Missing authorization" }, 401);
    const userId = await findUserIdByToken(c.env.KV, token);
    if (!userId) return c.json({ error: "Invalid or expired token" }, 401);

    const body = await c.req.json<{
      owner: string;
      repo: string;
      pullNumber: number;
      method?: "merge" | "squash" | "rebase";
    }>();
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    await octokit.rest.pulls.merge({
      owner: body.owner,
      repo: body.repo,
      pull_number: body.pullNumber,
      merge_method: body.method ?? "squash",
    });

    return c.json({ ok: true });
  });

  app.post("/api/close", async (c) => {
    const token = extractBearerToken(c);
    if (!token) return c.json({ error: "Missing authorization" }, 401);
    const userId = await findUserIdByToken(c.env.KV, token);
    if (!userId) return c.json({ error: "Invalid or expired token" }, 401);

    const body = await c.req.json<{
      owner: string;
      repo: string;
      pullNumber: number;
    }>();
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    await octokit.rest.pulls.update({
      owner: body.owner,
      repo: body.repo,
      pull_number: body.pullNumber,
      state: "closed",
    });

    return c.json({ ok: true });
  });

  app.post("/api/react", async (c) => {
    const token = extractBearerToken(c);
    if (!token) return c.json({ error: "Missing authorization" }, 401);
    const userId = await findUserIdByToken(c.env.KV, token);
    if (!userId) return c.json({ error: "Invalid or expired token" }, 401);

    const body = await c.req.json<{
      owner: string;
      repo: string;
      issueNumber: number;
      reaction: string;
    }>();
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    await octokit.rest.reactions.createForIssue({
      owner: body.owner,
      repo: body.repo,
      issue_number: body.issueNumber,
      content: body.reaction as
        "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes",
    });

    return c.json({ ok: true });
  });

  return app;
}
