import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatPullRequestReview(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "submitted";
  const review = payload.review as {
    state?: string;
    body?: string;
    html_url?: string;
  };
  const pr = payload.pull_request as {
    number?: number;
    title?: string;
    html_url?: string;
  };

  const state = review.state ?? "commented";
  const colorKey =
    state === "approved"
      ? "pull_request_review_approved"
      : state === "changes_requested"
        ? "pull_request_review_changes"
        : "pull_request_review_commented";

  const stateEmoji = state === "approved" ? "✅" : state === "changes_requested" ? "🔴" : "💬";
  const al = t("actions." + action) ?? state;
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.pr_review.action_review", { emoji: em(stateEmoji), action: al }));

  if (review.body) {
    const truncated = review.body.slice(0, 500);
    descriptionParts.push(`\n> ${truncated}${review.body.length > 500 ? "..." : ""}`);
  }

  return buildMessage(
    {
      author,
      title: t("events.pr_review.title", {
        repo: repo ?? t("common.repository"),
        number: pr.number ?? "?",
        title: pr.title ?? t("common.untitled"),
      }),
      url: review.html_url,
      color: GITHUB_COLORS[colorKey],
      description: descriptionParts.join("\n"),
    },
    t,
    repo,
  );
}

export function formatPullRequestReviewComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const comment = payload.comment as {
    body?: string;
    path?: string;
    position?: number | null;
    html_url?: string;
  };
  const pr = payload.pull_request as {
    number?: number;
    title?: string;
  };

  const al = t("actions." + action) ?? action;
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const commentBody = comment.body?.slice(0, 400) ?? "";
  const truncated = comment.body && comment.body.length > 400;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (comment.path) {
    const loc =
      comment.position != null
        ? t("events.pr_review_comment.line", { position: comment.position })
        : "";
    fields.push({
      name: t("fields.file"),
      value: `\`${comment.path}\`${loc}`,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.pr_review_comment.title", {
        repo: repo ?? t("common.repository"),
        number: pr.number ?? "?",
        title: pr.title ?? t("common.untitled"),
      }),
      url: comment.html_url,
      color: GITHUB_COLORS.pull_request_review_commented,
      description: `${t("events.pr_review_comment.action_inline", { emoji: em("💬"), action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
