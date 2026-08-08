import type { NeutralMessage, NeutralAuthor, NeutralAction } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatPullRequest(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "opened";
  const pr = payload.pull_request as {
    number?: number;
    title?: string;
    html_url?: string;
    state?: string;
    draft?: boolean;
    merged?: boolean;
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
    body?: string;
    labels?: Array<{ name?: string; color?: string }>;
    changed_files?: number;
    additions?: number;
    deletions?: number;
  };

  const colorKey = pr.merged
    ? "pull_request_merged"
    : action === "closed"
      ? "pull_request_closed"
      : action === "ready_for_review"
        ? "pull_request_ready_for_review"
        : action === "opened"
          ? "pull_request_opened"
          : "pull_request_other";

  const al = t("actions." + action) ?? action;
  const stateEmoji = pr.merged
    ? "🟣"
    : action === "closed"
      ? "🔴"
      : action === "opened"
        ? "🟢"
        : "🔵";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.pr.action_pr", { emoji: em(stateEmoji), action: al }));

  if (pr.body) {
    const truncated = pr.body.slice(0, 300);
    descriptionParts.push(`\n${truncated}${pr.body.length > 300 ? "..." : ""}`);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (pr.head?.ref && pr.base?.ref) {
    fields.push({
      name: t("fields.branch"),
      value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``,
      inline: true,
    });
  }

  if (pr.changed_files != null || pr.additions != null || pr.deletions != null) {
    const parts: string[] = [];
    if (pr.additions != null) parts.push(`+${pr.additions}`);
    if (pr.deletions != null) parts.push(`-${pr.deletions}`);
    if (pr.changed_files != null) parts.push(t("common.n_files", { count: pr.changed_files }));
    fields.push({
      name: t("fields.changes"),
      value: parts.join(" | "),
      inline: true,
    });
  }

  if (pr.labels && pr.labels.length > 0) {
    fields.push({
      name: t("fields.labels"),
      value: pr.labels.map((l) => l.name).join(", "),
      inline: true,
    });
  }

  const [repoOwner, repoName] = (repo ?? "/").split("/", 2);
  const actionable = pr.state === "open" && !!repoOwner && !!repoName && pr.number != null;
  const actions: NeutralAction[] | undefined = actionable
    ? [
        { id: `ghpr|merge|${repoOwner}|${repoName}|${pr.number}`, label: "合并", style: "primary" },
        { id: `ghpr|close|${repoOwner}|${repoName}|${pr.number}`, label: "关闭", style: "danger" },
      ]
    : undefined;

  return buildMessage(
    {
      author,
      title: t("events.pr.title", {
        repo: repo ?? t("common.repository"),
        number: pr.number ?? "?",
        title: pr.title ?? t("common.untitled"),
      }),
      url: pr.html_url,
      color: GITHUB_COLORS[colorKey],
      description: descriptionParts.join("\n"),
      fields: fields.length > 0 ? fields : undefined,
      actions,
    },
    t,
    repo,
  );
}
