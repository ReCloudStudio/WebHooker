import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS, WORKFLOW_CONCLUSION_EMOJI } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatWorkflowJob(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const job = payload.workflow_job as {
    name?: string;
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    head_sha?: string;
    html_url?: string;
    workflow_name?: string;
    run_id?: number;
  };

  const status =
    job.status === "queued"
      ? "queued"
      : job.status === "in_progress"
        ? "running"
        : (job.conclusion ?? "pending");
  const emoji = WORKFLOW_CONCLUSION_EMOJI[status] ?? "⏳";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const colorKey =
    status === "success"
      ? "workflow_run_success"
      : status === "failure"
        ? "workflow_run_failure"
        : "workflow_run_other";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}${status}`,
    inline: true,
  });

  if (job.name) {
    fields.push({
      name: t("fields.job"),
      value: job.name,
      inline: true,
    });
  }

  if (job.workflow_name) {
    fields.push({
      name: t("fields.workflow"),
      value: job.workflow_name,
      inline: true,
    });
  }

  if (job.head_branch) {
    fields.push({
      name: t("fields.branch"),
      value: `\`${job.head_branch}\``,
      inline: true,
    });
  }

  if (job.head_sha) {
    fields.push({
      name: t("fields.commit"),
      value: `\`${job.head_sha.slice(0, 7)}\``,
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.workflow_job.title", {
        repo: repo ?? t("common.repository"),
        name: job.name ?? "Job",
        conclusion: status,
      }),
      url: job.html_url,
      color: GITHUB_COLORS[colorKey],
      fields,
    },
    t,
    repo,
  );
}

export function formatWorkflowRun(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const workflow = payload.workflow_run as {
    id?: number;
    name?: string;
    conclusion?: string;
    html_url?: string;
    head_branch?: string;
    run_number?: number;
    created_at?: string;
    updated_at?: string;
    elapsed_seconds?: number;
    jobs?: Array<{ name?: string; conclusion?: string }>;
  };

  const action = payload.action as string | undefined;
  const status =
    action === "in_progress"
      ? "running"
      : action === "requested"
        ? "queued"
        : (workflow.conclusion ?? "pending");
  const emoji = WORKFLOW_CONCLUSION_EMOJI[status] ?? "⏳";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const colorKey =
    status === "success"
      ? "workflow_run_success"
      : status === "failure"
        ? "workflow_run_failure"
        : "workflow_run_other";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}${status}`,
    inline: true,
  });

  if (workflow.jobs?.length) {
    const jobLines = workflow.jobs.map(
      (j) => `${em(WORKFLOW_CONCLUSION_EMOJI[j.conclusion ?? ""] ?? "⏳")}${j.name ?? ""}`,
    );
    fields.push({
      name: t("fields.job"),
      value: jobLines.join("\n"),
      inline: false,
    });
  }

  if (workflow.head_branch) {
    fields.push({
      name: t("fields.branch"),
      value: `\`${workflow.head_branch}\``,
      inline: true,
    });
  }

  if (workflow.run_number) {
    fields.push({
      name: t("fields.run"),
      value: `#${workflow.run_number}`,
      inline: true,
    });
  }

  if (workflow.elapsed_seconds != null) {
    const mins = Math.floor(workflow.elapsed_seconds / 60);
    const secs = workflow.elapsed_seconds % 60;
    fields.push({
      name: t("fields.duration"),
      value: `${mins}m ${secs}s`,
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.workflow_run.title", {
        repo: repo ?? t("common.repository"),
        name: workflow.name ?? "Workflow",
        conclusion: status,
      }),
      url: workflow.html_url,
      color: GITHUB_COLORS[colorKey],
      fields,
      updateKey:
        repo && workflow.id != null ? `workflow_run:${repo}:${workflow.id}` : undefined,
    },
    t,
    repo,
  );
}
