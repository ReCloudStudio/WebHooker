import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatMilestone(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const milestone = payload.milestone as {
    title?: string;
    number?: number;
    state?: string;
    open_issues?: number;
    closed_issues?: number;
    due_on?: string;
    html_url?: string;
  };

  const al = t("actions." + action) ?? action;
  const stateEmoji = milestone.state === "closed" ? "✅" : "🔵";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (milestone.title) {
    fields.push({
      name: t("fields.milestone"),
      value: milestone.title,
      inline: true,
    });
  }

  if (milestone.number) {
    fields.push({
      name: t("fields.number"),
      value: `#${milestone.number}`,
      inline: true,
    });
  }

  if (milestone.open_issues != null && milestone.closed_issues != null) {
    const total = milestone.open_issues + milestone.closed_issues;
    const pct = total > 0 ? Math.round((milestone.closed_issues / total) * 100) : 0;
    const bar = pct >= 75 ? "🟢🟢🟢" : pct >= 50 ? "🟡🟡" : pct > 0 ? "🟠" : "⬜";
    fields.push({
      name: t("fields.progress"),
      value: `${bar} ${milestone.closed_issues}/${total} (${pct}%)`,
      inline: false,
    });
  }

  if (milestone.due_on) {
    fields.push({
      name: t("fields.due"),
      value: milestone.due_on.split("T")[0],
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.milestone.title", {
        repo: repo ?? t("common.repository"),
        emoji: em(stateEmoji),
        action: al,
        title: milestone.title ?? t("common.unknown"),
      }),
      url: milestone.html_url,
      color:
        milestone.state === "closed"
          ? GITHUB_COLORS.milestone_closed
          : GITHUB_COLORS.milestone_opened,
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
