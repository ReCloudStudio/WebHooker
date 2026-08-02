import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS, WORKFLOW_CONCLUSION_EMOJI } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatCheckRun(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const checkRun = payload.check_run as {
    name?: string;
    conclusion?: string;
    html_url?: string;
    status?: string;
    output?: { title?: string; summary?: string };
  };

  const status =
    checkRun.status === "queued"
      ? "queued"
      : checkRun.status === "in_progress"
        ? "running"
        : (checkRun.conclusion ?? "pending");
  const emoji = WORKFLOW_CONCLUSION_EMOJI[status] ?? "⏳";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const colorKey =
    status === "success"
      ? "check_run_success"
      : status === "failure"
        ? "check_run_failure"
        : "check_run_other";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}${status}`,
    inline: true,
  });

  if (checkRun.output?.title) {
    fields.push({
      name: t("fields.details"),
      value: checkRun.output.title,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.check_run.title", {
        repo: repo ?? t("common.repository"),
        name: checkRun.name ?? "Check Run",
        conclusion: status,
      }),
      url: checkRun.html_url,
      color: GITHUB_COLORS[colorKey],
      fields,
    },
    t,
    repo,
  );
}
