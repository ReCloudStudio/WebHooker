import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatIssueComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const issue = payload.issue as {
    number?: number;
    title?: string;
    html_url?: string;
  };
  const comment = payload.comment as {
    body?: string;
    html_url?: string;
  };

  const al = t("actions." + action) ?? action;
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const commentBody = comment.body?.slice(0, 500) ?? "";
  const truncated = comment.body && comment.body.length > 500;

  return buildMessage(
    {
      author,
      title: t("events.issue_comment.title", {
        repo: repo ?? t("common.repository"),
        number: issue.number ?? "?",
        title: issue.title ?? t("common.untitled"),
      }),
      url: comment.html_url ?? issue.html_url,
      color: GITHUB_COLORS.issue_comment,
      description: `${t("events.issue_comment.action_comment", { emoji: em("💬"), action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
    },
    t,
    repo,
  );
}
