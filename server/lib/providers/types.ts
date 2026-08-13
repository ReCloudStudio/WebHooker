import type { Env, WebhookEvent } from "../types";

/**
 * A forge webhook provider (GitHub, Gitea, GitLab, ...). Each provider owns
 * signature verification and payload parsing/normalization. The rest of the
 * pipeline (route matching, formatting, dispatch) only sees the normalized
 * {@link WebhookEvent} and never knows which forge produced it.
 */
export interface Provider {
  readonly id: "github" | "gitea" | "gitlab" | "custom";
  /**
   * Whether the request headers belong to this provider (e.g. checks the
   * `X-Gitea-Event` header).
   */
  matches(headers: Record<string, string>): boolean;
  /** Verify the webhook signature. Returns false when the secret is missing. */
  verify(body: string, headers: Record<string, string>, env: Env): Promise<boolean>;
  /**
   * Parse the body and normalize it into a {@link WebhookEvent} whose payload
   * is shaped like a GitHub event so the shared formatters can consume it.
   */
  parse(body: string, headers: Record<string, string>): WebhookEvent | null;
}
