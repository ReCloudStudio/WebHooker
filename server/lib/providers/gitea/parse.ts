import type { WebhookEvent } from "../../types";

/**
 * Gitea webhook events that map to a different internal event name. Everything
 * else already uses the same name as GitHub (push, issues, release, ...).
 */
const EVENT_MAP: Record<string, string> = {
  pull_request_comment: "pull_request_review_comment",
};

/**
 * Normalize a Gitea webhook payload so the shared GitHub-shaped formatters can
 * consume it. Gitea models its payloads on GitHub but with a few differences.
 */
function normalizePayload(
  event: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (event === "push") {
    // Gitea sends `compare_url` (GitHub sends `compare`).
    if (payload.compare_url && payload.compare === undefined) {
      payload.compare = payload.compare_url;
    }
    // Gitea sends `pusher` (and `sender`); keep a `sender` for the formatters.
    if (!payload.sender && payload.pusher) {
      payload.sender = payload.pusher;
    }
  }

  if (event === "pull_request_comment") {
    // GitHub names this event pull_request_review_comment and always includes
    // a top-level `pull_request`. Gitea may only carry the PR-as-issue.
    if (!payload.pull_request && payload.issue) {
      payload.pull_request = payload.issue;
    }
    // GitHub uses `comment.position` for the line number, Gitea uses `line`.
    const comment = payload.comment as { line?: number; position?: number } | undefined;
    if (comment && comment.position === undefined && comment.line !== undefined) {
      comment.position = comment.line;
    }
  }

  if (event === "commit_comment") {
    // Gitea puts the commit id at the top level, GitHub on the comment object.
    const comment = payload.comment as { commit_id?: string } | undefined;
    if (comment && !comment.commit_id && typeof payload.commit_id === "string") {
      comment.commit_id = payload.commit_id;
    }
  }

  return payload;
}

export function parseGiteaEvent(
  headers: Record<string, string>,
  body: string,
): WebhookEvent | null {
  const event = headers["x-gitea-event"];
  const signature = headers["x-gitea-signature"];
  const deliveryId = headers["x-gitea-delivery"];

  if (!event) return null;

  try {
    const payload = normalizePayload(event, JSON.parse(body));
    return {
      provider: "gitea",
      event: EVENT_MAP[event] ?? event,
      payload,
      signature,
      deliveryId,
    };
  } catch {
    return null;
  }
}
