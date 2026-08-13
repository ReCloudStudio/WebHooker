import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { commitLink, emojiPrefix, type T, buildMessage, repoBaseUrl } from "./helpers";

export function formatCommitComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const comment = payload.comment as {
    body?: string;
    commit_id?: string;
    html_url?: string;
  };

  const al = t("actions." + action) ?? action;
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const commentBody = comment.body?.slice(0, 500) ?? "";
  const truncated = comment.body && comment.body.length > 500;
  const baseUrl = repoBaseUrl(payload, repo);
  const shortSha = comment.commit_id?.slice(0, 7) ?? "???????";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (comment.commit_id) {
    fields.push({
      name: t("fields.commit"),
      value: commitLink(baseUrl, comment.commit_id, shortSha),
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.commit_comment.title", {
        repo: repo ?? t("common.repository"),
        sha: commitLink(baseUrl, comment.commit_id ?? "", shortSha),
      }),
      url: comment.html_url,
      color: GITHUB_COLORS.commit_comment,
      description: `${t("events.commit_comment.action_comment", { emoji: em("💬"), action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
