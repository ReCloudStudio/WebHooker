import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatDiscussion(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const discussion = payload.discussion as {
    number?: number;
    title?: string;
    html_url?: string;
    category?: { name?: string };
  };

  const al = t("actions." + action) ?? action;
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const stateEmoji =
    action === "answered"
      ? "✅"
      : action === "closed"
        ? "🔴"
        : action === "created"
          ? "🟢"
          : action === "deleted"
            ? "🗑️"
            : "💬";

  const category = discussion.category?.name;

  return buildMessage(
    {
      author,
      title: t("events.discussion.title", {
        repo: repo ?? t("common.repository"),
        number: discussion.number ?? "?",
        title: discussion.title ?? t("common.untitled"),
      }),
      url: discussion.html_url,
      color:
        action === "answered"
          ? GITHUB_COLORS.discussion_answered
          : GITHUB_COLORS.discussion_created,
      description: t("events.discussion.action_discussion", {
        emoji: em(stateEmoji),
        action: al,
        category: category ? ` in **${category}**` : "",
      }),
    },
    t,
    repo,
  );
}

export function formatDiscussionComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const comment = payload.comment as {
    body?: string;
    html_url?: string;
  };
  const discussion = payload.discussion as {
    number?: number;
    title?: string;
  };

  const al = t("actions." + action) ?? action;
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const commentBody = comment.body?.slice(0, 500) ?? "";
  const truncated = comment.body && comment.body.length > 500;

  return buildMessage(
    {
      author,
      title: t("events.discussion_comment.title", {
        repo: repo ?? t("common.repository"),
        number: discussion.number ?? "?",
        title: discussion.title ?? t("common.untitled"),
      }),
      url: comment.html_url,
      color: GITHUB_COLORS.discussion_comment,
      description: `${t("events.discussion_comment.action_comment", { emoji: em("💬"), action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
    },
    t,
    repo,
  );
}
