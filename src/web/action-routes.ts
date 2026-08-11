import { Hono } from "hono";
import { getUserOctokit } from "../github/oauth";
import { bearerAuthMiddleware, type AuthEnv } from "./auth";
import { log } from "../lib/log";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function readJson(c: {
  req: { json: <T>() => Promise<T> };
}): Promise<Record<string, unknown> | null> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function createActionRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();

  app.post("/api/comment", bearerAuthMiddleware(), async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    if (
      !body ||
      !isNonEmptyString(body.owner) ||
      !isNonEmptyString(body.repo) ||
      !isValidId(body.issueNumber) ||
      !isNonEmptyString(body.body)
    ) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    try {
      await octokit.rest.issues.createComment({
        owner: body.owner,
        repo: body.repo,
        issue_number: body.issueNumber,
        body: body.body,
      });
    } catch (err) {
      log.error({ err }, "Failed to create comment");
      return c.json({ error: "GitHub API error" }, 500);
    }

    return c.json({ ok: true });
  });

  app.post("/api/merge", bearerAuthMiddleware(), async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    if (
      !body ||
      !isNonEmptyString(body.owner) ||
      !isNonEmptyString(body.repo) ||
      !isValidId(body.pullNumber)
    ) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const method = body.method === undefined ? "squash" : body.method;
    if (method !== "merge" && method !== "squash" && method !== "rebase") {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    try {
      await octokit.rest.pulls.merge({
        owner: body.owner,
        repo: body.repo,
        pull_number: body.pullNumber,
        merge_method: method,
      });
    } catch (err) {
      log.error({ err }, "Failed to merge pull request");
      return c.json({ error: "GitHub API error" }, 500);
    }

    return c.json({ ok: true });
  });

  app.post("/api/close", bearerAuthMiddleware(), async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    if (
      !body ||
      !isNonEmptyString(body.owner) ||
      !isNonEmptyString(body.repo) ||
      !isValidId(body.pullNumber)
    ) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    try {
      await octokit.rest.pulls.update({
        owner: body.owner,
        repo: body.repo,
        pull_number: body.pullNumber,
        state: "closed",
      });
    } catch (err) {
      log.error({ err }, "Failed to close pull request");
      return c.json({ error: "GitHub API error" }, 500);
    }

    return c.json({ ok: true });
  });

  app.post("/api/react", bearerAuthMiddleware(), async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const reactions = [
      "+1",
      "-1",
      "laugh",
      "confused",
      "heart",
      "hooray",
      "rocket",
      "eyes",
    ] as const;
    if (
      !body ||
      !isNonEmptyString(body.owner) ||
      !isNonEmptyString(body.repo) ||
      !isValidId(body.issueNumber) ||
      !isNonEmptyString(body.reaction) ||
      !(reactions as readonly string[]).includes(body.reaction)
    ) {
      return c.json({ error: "Invalid request body" }, 400);
    }
    const octokit = await getUserOctokit(userId, c.env.KV);
    if (!octokit) return c.json({ error: "Not authorized" }, 401);

    try {
      await octokit.rest.reactions.createForIssue({
        owner: body.owner,
        repo: body.repo,
        issue_number: body.issueNumber,
        content: body.reaction as
          "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray" | "rocket" | "eyes",
      });
    } catch (err) {
      log.error({ err }, "Failed to create reaction");
      return c.json({ error: "GitHub API error" }, 500);
    }

    return c.json({ ok: true });
  });

  return app;
}
