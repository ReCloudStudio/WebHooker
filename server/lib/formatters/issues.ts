import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { cap, emojiPrefix, MAX_FIELD_VALUE, type T, buildMessage } from "./helpers";

export function formatIssues(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "opened";
  const issue = payload.issue as {
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    body?: string;
    labels?: Array<{ name?: string; color?: string }>;
    assignees?: Array<{ login?: string }>;
    milestone?: { title?: string };
  };

  const colorKey =
    action === "closed"
      ? "issues_closed"
      : action === "reopened"
        ? "issues_reopened"
        : action === "opened"
          ? "issues_opened"
          : "issues_other";

  const al = t("actions." + action) ?? action;
  const stateEmoji = action === "closed" ? "🔴" : action === "opened" ? "🟢" : "🟣";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.issues.action_issue", { emoji: em(stateEmoji), action: al }));

  if (issue.body) {
    const truncated = issue.body.slice(0, 300);
    descriptionParts.push(`\n${truncated}${issue.body.length > 300 ? "..." : ""}`);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (issue.labels && issue.labels.length > 0) {
    fields.push({
      name: t("fields.labels"),
      value: cap(issue.labels.map((l) => l.name).join(", "), MAX_FIELD_VALUE),
      inline: true,
    });
  }

  if (issue.assignees && issue.assignees.length > 0) {
    fields.push({
      name: t("fields.assignees"),
      value: cap(issue.assignees.map((a) => a.login).join(", "), MAX_FIELD_VALUE),
      inline: true,
    });
  }

  if (issue.milestone) {
    fields.push({
      name: t("fields.milestone"),
      value: issue.milestone.title ?? t("common.unknown"),
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.issues.title", {
        repo: repo ?? t("common.repository"),
        number: issue.number ?? "?",
        title: issue.title ?? t("common.untitled"),
      }),
      url: issue.html_url,
      color: GITHUB_COLORS[colorKey],
      description: descriptionParts.join("\n"),
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
