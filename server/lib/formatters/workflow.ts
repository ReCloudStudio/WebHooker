import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS, WORKFLOW_CONCLUSION_EMOJI } from "./colors";
import {
  branchLink,
  cap,
  commitLink,
  emojiPrefix,
  MAX_FIELD_VALUE,
  statusColorKey,
  type T,
  buildMessage,
  repoBaseUrl,
  workflowRunStatus,
  workflowStatus,
} from "./helpers";

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

  const status = workflowStatus(job.status, job.conclusion ?? undefined);
  const emoji = WORKFLOW_CONCLUSION_EMOJI[status] ?? "⏳";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const baseUrl = repoBaseUrl(payload, repo);
  const colorKey = statusColorKey("workflow_run", status);

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
      value: branchLink(baseUrl, job.head_branch),
      inline: true,
    });
  }

  if (job.head_sha) {
    fields.push({
      name: t("fields.commit"),
      value: commitLink(baseUrl, job.head_sha),
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

function jobDuration(startedAt?: string, completedAt?: string): string | undefined {
  if (!startedAt || !completedAt) return undefined;
  const secs = Math.max(0, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000));
  if (!Number.isFinite(secs)) return undefined;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
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
    jobs?: Array<{
      name?: string;
      status?: string;
      conclusion?: string | null;
      started_at?: string;
      completed_at?: string;
    }>;
  };

  const action = payload.action as string | undefined;
  const status = workflowRunStatus(action, workflow.conclusion);
  const emoji = WORKFLOW_CONCLUSION_EMOJI[status] ?? "⏳";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const baseUrl = repoBaseUrl(payload, repo);
  const colorKey = statusColorKey("workflow_run", status);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}${status}`,
    inline: true,
  });

  if (workflow.jobs?.length) {
    // Many-jobs workflows must stay under the Discord field value limit.
    // Discord colors `diff` blocks: `+` lines green, `-` lines red, and
    // plain (space-prefixed) lines default gray/white — used for running.
    const jobLines = workflow.jobs.map((j) => {
      const status =
        j.status === "in_progress"
          ? "running"
          : j.status === "queued"
            ? "queued"
            : j.conclusion ?? "pending";
      const emoji = WORKFLOW_CONCLUSION_EMOJI[status] ?? "⏳";
      const marker =
        status === "success"
          ? "+"
          : status === "running" || status === "queued" || status === "pending"
            ? " "
            : "-";
      const done =
        status !== "running" && status !== "queued" && status !== "pending";
      const duration = done ? jobDuration(j.started_at, j.completed_at) : undefined;
      return `${marker} ${cap(j.name ?? "", 200)} ${em(emoji)}${status}${duration ? ` · ${duration}` : ""}`;
    });
    fields.push({
      name: t("fields.job"),
      value: cap(`\`\`\`diff\n${jobLines.join("\n")}\n\`\`\``, MAX_FIELD_VALUE),
      inline: false,
    });
  }

  if (workflow.head_branch) {
    fields.push({
      name: t("fields.branch"),
      value: branchLink(baseUrl, workflow.head_branch),
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

  const runLabel = workflow.html_url
    ? `[${workflow.name ?? "Workflow"} — ${status}](${workflow.html_url})`
    : `${workflow.name ?? "Workflow"} — ${status}`;

  return buildMessage(
    {
      author,
      title: t("events.workflow_run.title", {
        repo: repo ?? t("common.repository"),
        run: runLabel,
      }),
      url: workflow.html_url,
      color: GITHUB_COLORS[colorKey],
      fields,
      updateKey: repo && workflow.id != null ? `workflow_run:${repo}:${workflow.id}` : undefined,
    },
    t,
    repo,
  );
}
