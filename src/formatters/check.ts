import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS, WORKFLOW_CONCLUSION_EMOJI } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatCheckSuite(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const suite = payload.check_suite as {
    head_branch?: string;
    head_sha?: string;
    conclusion?: string;
    status?: string;
    app?: { name?: string };
    html_url?: string;
  };

  const status =
    suite.status === "queued"
      ? "queued"
      : suite.status === "in_progress"
        ? "running"
        : (suite.conclusion ?? "pending");
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

  if (suite.app?.name) {
    fields.push({
      name: t("fields.service"),
      value: suite.app.name,
      inline: true,
    });
  }

  if (suite.head_branch) {
    fields.push({
      name: t("fields.branch"),
      value: suite.head_branch,
      inline: true,
    });
  }

  if (suite.head_sha) {
    fields.push({
      name: t("fields.commit"),
      value: suite.head_sha.slice(0, 7),
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.check_suite.title", {
        repo: repo ?? t("common.repository"),
        conclusion: status,
      }),
      url: suite.html_url,
      color: GITHUB_COLORS[colorKey],
      fields,
    },
    t,
    repo,
  );
}

export function formatStatus(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const state = (payload.state as string) ?? "pending";
  const context = (payload.context as string) ?? "";
  const description = payload.description as string | undefined;
  const targetUrl = payload.target_url as string | undefined;
  const sha = payload.sha as string | undefined;

  const emoji = state === "success" ? "✅" : state === "failure" || state === "error" ? "❌" : "⏳";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const colorKey =
    state === "success"
      ? "check_run_success"
      : state === "failure" || state === "error"
        ? "check_run_failure"
        : "check_run_other";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}${state}`,
    inline: true,
  });

  if (context) {
    fields.push({
      name: t("fields.context"),
      value: context,
      inline: true,
    });
  }

  if (sha) {
    fields.push({
      name: t("fields.commit"),
      value: `\`${sha.slice(0, 7)}\``,
      inline: true,
    });
  }

  if (description) {
    fields.push({
      name: t("fields.description"),
      value: description,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.status.title", {
        repo: repo ?? t("common.repository"),
        context: context || t("common.unknown"),
        state,
      }),
      url: targetUrl,
      color: GITHUB_COLORS[colorKey],
      fields,
    },
    t,
    repo,
  );
}

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
