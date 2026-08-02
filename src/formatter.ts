import type { Route, WebhookEvent, FormattedMessage } from "./types";
import type { Translations } from "./i18n";
import { t as translate } from "./i18n";

const GITHUB_COLORS = {
  push: 0x2ea44f,
  pull_request_opened: 0x2da44e,
  pull_request_closed: 0xf85149,
  pull_request_merged: 0x8957e5,
  pull_request_ready_for_review: 0x2da44e,
  pull_request_other: 0x1f6feb,
  issues_opened: 0x2da44e,
  issues_closed: 0xf85149,
  issues_reopened: 0x1f6feb,
  issues_other: 0x8957e5,
  issue_comment: 0x6e7681,
  workflow_run_success: 0x2da44e,
  workflow_run_failure: 0xf85149,
  workflow_run_other: 0xd29922,
  release_published: 0x2da44e,
  release_prerelease: 0xd29922,
  release_deleted: 0xf85149,
  create: 0x3fb950,
  delete: 0xf85149,
  star: 0xd29922,
  fork: 0x1f6feb,
  discussion: 0x8957e5,
  check_run_success: 0x2da44e,
  check_run_failure: 0xf85149,
  check_run_other: 0xd29922,
  pull_request_review_approved: 0x2da44e,
  pull_request_review_changes: 0xf85149,
  pull_request_review_commented: 0x8b949e,
  commit_comment: 0x6e7681,
  deployment_success: 0x2da44e,
  deployment_failure: 0xf85149,
  deployment_pending: 0xd29922,
  member_added: 0x2da44e,
  member_removed: 0xf85149,
  label: 0x8957e5,
  milestone_opened: 0x1f6feb,
  milestone_closed: 0x2da44e,
  discussion_created: 0x8957e5,
  discussion_answered: 0x2da44e,
  discussion_comment: 0x6e7681,
  repository: 0x8b949e,
  code_scanning_critical: 0xf85149,
  code_scanning_high: 0xf85149,
  code_scanning_medium: 0xd29922,
  code_scanning_low: 0x8b949e,
  dependabot_critical: 0xf85149,
  dependabot_high: 0xf85149,
  dependabot_medium: 0xd29922,
  dependabot_low: 0x8b949e,
  default: 0x8b949e,
};

const WORKFLOW_CONCLUSION_EMOJI: Record<string, string> = {
  success: "✅",
  failure: "❌",
  cancelled: "🚫",
  timed_out: "⏱️",
  action_required: "⚠️",
  neutral: "➖",
  stale: "♻️",
};

type T = (key: string, params?: Record<string, string | number>) => string;

export function formatEvent(route: Route, event: WebhookEvent, tr?: Translations): FormattedMessage {
  const { event: eventType, payload } = event;
  const repo = (payload.repository as { full_name?: string })?.full_name;
  const sender = (payload.sender as { login?: string })?.login;
  const senderAvatar = (payload.sender as { avatar_url?: string })?.avatar_url;
  const repoUrl = (payload.repository as { html_url?: string })?.html_url;

  const t: T = (key, params) => translate(key, params, undefined, tr);

  const author = {
    name: sender ?? t("common.unknown"),
    icon_url: senderAvatar,
    url: sender ? `https://github.com/${sender}` : undefined,
  };

  switch (eventType) {
    case "push":
      return formatPush(payload, repo, author, t);
    case "pull_request":
      return formatPullRequest(payload, repo, author, t);
    case "pull_request_review":
      return formatPullRequestReview(payload, repo, author, t);
    case "pull_request_review_comment":
      return formatPullRequestReviewComment(payload, repo, author, t);
    case "issues":
      return formatIssues(payload, repo, author, t);
    case "issue_comment":
      return formatIssueComment(payload, repo, author, t);
    case "workflow_run":
      return formatWorkflowRun(payload, repo, author, t);
    case "release":
      return formatRelease(payload, repo, author, t);
    case "create":
      return formatCreate(payload, repo, author, t);
    case "delete":
      return formatDelete(payload, repo, author, t);
    case "star":
      return formatStar(payload, repo, repoUrl, author, t);
    case "fork":
      return formatFork(payload, repo, repoUrl, author, t);
    case "check_run":
      return formatCheckRun(payload, repo, author, t);
    case "commit_comment":
      return formatCommitComment(payload, repo, author, t);
    case "deployment_status":
      return formatDeploymentStatus(payload, repo, author, t);
    case "member":
      return formatMember(payload, repo, author, t);
    case "label":
      return formatLabel(payload, repo, author, t);
    case "milestone":
      return formatMilestone(payload, repo, author, t);
    case "discussion":
      return formatDiscussion(payload, repo, author, t);
    case "discussion_comment":
      return formatDiscussionComment(payload, repo, author, t);
    case "repository":
      return formatRepository(payload, repo, repoUrl, author, t);
    case "code_scanning_alert":
      return formatCodeScanningAlert(payload, repo, author, t);
    case "dependabot_alert":
      return formatDependabotAlert(payload, repo, author, t);
    default:
      return formatGeneric(eventType, payload, repo, author, t);
  }
}

function formatPush(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const ref = (payload.ref as string)?.replace("refs/heads/", "").replace("refs/tags/", "tag: ");
  const commits = (payload.commits ?? []) as Array<{
    id?: string;
    message?: string;
    author?: { name?: string; email?: string };
    added?: string[];
    removed?: string[];
    modified?: string[];
  }>;
  const count = commits.length;
  const compareUrl = payload.compare as string | undefined;
  const forced = payload.forced as boolean | undefined;
  const created = payload.created as boolean | undefined;

  const descriptionParts: string[] = [];

  if (forced) {
    descriptionParts.push(t("events.push.force_push"));
  }
  if (created) {
    descriptionParts.push(t("events.push.branch_created"));
  }

  descriptionParts.push(t("events.push.commits_pushed", { count, s: count !== 1 ? "s" : "", ref: ref ?? "" }));

  if (compareUrl) {
    descriptionParts.push(t("events.push.view_comparison", { url: compareUrl }));
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (count <= 5) {
    for (const c of commits) {
      const shortId = c.id?.slice(0, 7) ?? "???????";
      const msg = c.message?.split("\n")[0].slice(0, 72) ?? t("common.no_message");
      fields.push({
        name: `\`${shortId}\``,
        value: msg,
        inline: false,
      });
    }
  } else {
    const first3 = commits.slice(0, 3);
    for (const c of first3) {
      const shortId = c.id?.slice(0, 7) ?? "???????";
      const msg = c.message?.split("\n")[0].slice(0, 72) ?? t("common.no_message");
      fields.push({
        name: `\`${shortId}\``,
        value: msg,
        inline: false,
      });
    }
    fields.push({
      name: `\u200b`,
      value: t("common.and_n_more", { count: count - 3 }),
      inline: false,
    });
  }

  const added = commits.flatMap((c) => c.added ?? []);
  const removed = commits.flatMap((c) => c.removed ?? []);
  const modified = commits.flatMap((c) => c.modified ?? []);

  if (added.length > 0 || removed.length > 0 || modified.length > 0) {
    const changes: string[] = [];
    if (added.length > 0) changes.push(t("events.push.added", { count: added.length }));
    if (removed.length > 0) changes.push(t("events.push.removed", { count: removed.length }));
    if (modified.length > 0) changes.push(t("events.push.modified", { count: modified.length }));
    fields.push({
      name: t("fields.changes"),
      value: changes.join(" | "),
      inline: true,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.push.title", { count, s: count !== 1 ? "s" : "", repo: repo ?? t("common.repository") }),
        url: compareUrl,
        color: GITHUB_COLORS.push,
        description: descriptionParts.join("\n"),
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatPullRequest(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
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

  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.pr.action_pr", { emoji: stateEmoji, action: al }));

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

  // Merge / close buttons on the Discord notification. They only make sense
  // while the PR is still open. custom_id encodes the action + owner/repo/number
  // (repo full_name never contains "|").
  const actionable = pr.state === "open" && !!repo && pr.number != null;
  const components = actionable
    ? [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "合并", custom_id: `ghpr|merge|${repo}|${pr.number}` },
            { type: 2, style: 4, label: "关闭", custom_id: `ghpr|close|${repo}|${pr.number}` },
          ],
        },
      ]
    : undefined;

  return {
    embeds: [
      {
        author,
        title: t("events.pr.title", { repo: repo ?? t("common.repository"), number: pr.number ?? "?", title: pr.title ?? t("common.untitled") }),
        url: pr.html_url,
        color: GITHUB_COLORS[colorKey],
        description: descriptionParts.join("\n"),
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
    ...(components ? { components } : {}),
  };
}

function formatIssues(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
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

  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.issues.action_issue", { emoji: stateEmoji, action: al }));

  if (issue.body) {
    const truncated = issue.body.slice(0, 300);
    descriptionParts.push(`\n${truncated}${issue.body.length > 300 ? "..." : ""}`);
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (issue.labels && issue.labels.length > 0) {
    fields.push({
      name: t("fields.labels"),
      value: issue.labels.map((l) => l.name).join(", "),
      inline: true,
    });
  }

  if (issue.assignees && issue.assignees.length > 0) {
    fields.push({
      name: t("fields.assignees"),
      value: issue.assignees.map((a) => a.login).join(", "),
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

  return {
    embeds: [
      {
        author,
        title: t("events.issues.title", { repo: repo ?? t("common.repository"), number: issue.number ?? "?", title: issue.title ?? t("common.untitled") }),
        url: issue.html_url,
        color: GITHUB_COLORS[colorKey],
        description: descriptionParts.join("\n"),
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatIssueComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
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
  const commentBody = comment.body?.slice(0, 500) ?? "";
  const truncated = comment.body && comment.body.length > 500;

  return {
    embeds: [
      {
        author,
        title: t("events.issue_comment.comment_on", { repo: repo ?? t("common.repository"), number: issue.number ?? "?", title: issue.title ?? t("common.untitled") }),
        url: comment.html_url ?? issue.html_url,
        color: GITHUB_COLORS.issue_comment,
        description: `${t("events.issue_comment.action_comment", { action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatWorkflowRun(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const workflow = payload.workflow_run as {
    name?: string;
    conclusion?: string;
    html_url?: string;
    head_branch?: string;
    run_number?: number;
    created_at?: string;
    updated_at?: string;
    elapsed_seconds?: number;
  };

  const conclusion = workflow.conclusion ?? "pending";
  const emoji = WORKFLOW_CONCLUSION_EMOJI[conclusion] ?? "⏳";
  const colorKey =
    conclusion === "success"
      ? "workflow_run_success"
      : conclusion === "failure"
        ? "workflow_run_failure"
        : "workflow_run_other";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${emoji} ${conclusion}`,
    inline: true,
  });

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

  return {
    embeds: [
      {
        author,
        title: t("events.workflow_run.title", { name: workflow.name ?? "Workflow", conclusion }),
        url: workflow.html_url,
        color: GITHUB_COLORS[colorKey],
        fields,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatRelease(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "published";
  const release = payload.release as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    body?: string;
    prerelease?: boolean;
    draft?: boolean;
    author?: { login?: string };
  };

  const isPrerelease = release.prerelease;
  const colorKey =
    action === "deleted"
      ? "release_deleted"
      : isPrerelease
        ? "release_prerelease"
        : "release_published";
  const al = t("actions." + action) ?? action;
  const emoji = action === "deleted" ? "🗑️" : isPrerelease ? "⚠️" : "🚀";

  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.release.action_release", { emoji, action: al, tag: release.tag_name ?? t("common.unknown") }));

  if (release.body) {
    const truncated = release.body.slice(0, 300);
    descriptionParts.push(`\n${truncated}${release.body.length > 300 ? "..." : ""}`);
  }

  return {
    embeds: [
      {
        author,
        title: t("events.release.title", { name: release.name ?? release.tag_name ?? "Release", repo: repo ?? t("common.repository") }),
        url: release.html_url,
        color: GITHUB_COLORS[colorKey],
        description: descriptionParts.join("\n"),
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatCreate(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const refType = (payload.ref_type as string) ?? "branch";
  const ref = (payload.ref as string) ?? t("common.unknown");

  const emoji = refType === "tag" ? "🏷️" : "🌿";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.type"),
    value: refType,
    inline: true,
  });

  fields.push({
    name: t("fields.name"),
    value: `\`${ref}\``,
    inline: true,
  });

  if (payload.description) {
    fields.push({
      name: t("fields.description"),
      value: payload.description as string,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.create.title", { emoji, type: refType, ref, repo: repo ?? t("common.repository") }),
        color: GITHUB_COLORS.create,
        fields,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatDelete(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const refType = (payload.ref_type as string) ?? "branch";
  const ref = (payload.ref as string) ?? t("common.unknown");

  const emoji = refType === "tag" ? "🏷️" : "🌿";

  return {
    embeds: [
      {
        author,
        title: t("events.delete.title", { emoji, type: refType, ref, repo: repo ?? t("common.repository") }),
        color: GITHUB_COLORS.delete,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatStar(
  payload: Record<string, unknown>,
  repo: string | undefined,
  repoUrl: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const actionLabel = action === "created" ? t("events.star.starred") : t("events.star.unstarred");

  return {
    embeds: [
      {
        author,
        title: `${actionLabel} ${repo ?? t("common.repository")}`,
        url: repoUrl,
        color: GITHUB_COLORS.star,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatFork(
  payload: Record<string, unknown>,
  repo: string | undefined,
  repoUrl: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const forkee = payload.forkee as { full_name?: string; html_url?: string } | undefined;

  return {
    embeds: [
      {
        author,
        title: t("events.fork.title", { repo: repo ?? t("common.repository"), forkee: forkee?.full_name ?? t("common.unknown") }),
        url: forkee?.html_url ?? repoUrl,
        color: GITHUB_COLORS.fork,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatCheckRun(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const checkRun = payload.check_run as {
    name?: string;
    conclusion?: string;
    html_url?: string;
    status?: string;
    output?: { title?: string; summary?: string };
  };

  const conclusion = checkRun.conclusion ?? "pending";
  const emoji = WORKFLOW_CONCLUSION_EMOJI[conclusion] ?? "⏳";
  const colorKey =
    conclusion === "success"
      ? "check_run_success"
      : conclusion === "failure"
        ? "check_run_failure"
        : "check_run_other";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${emoji} ${conclusion}`,
    inline: true,
  });

  if (checkRun.output?.title) {
    fields.push({
      name: t("fields.details"),
      value: checkRun.output.title,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.check_run.title", { name: checkRun.name ?? "Check Run", conclusion }),
        url: checkRun.html_url,
        color: GITHUB_COLORS[colorKey],
        fields,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatPullRequestReview(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "submitted";
  const review = payload.review as {
    state?: string;
    body?: string;
    html_url?: string;
  };
  const pr = payload.pull_request as {
    number?: number;
    title?: string;
    html_url?: string;
  };

  const state = review.state ?? "commented";
  const colorKey =
    state === "approved"
      ? "pull_request_review_approved"
      : state === "changes_requested"
        ? "pull_request_review_changes"
        : "pull_request_review_commented";

  const stateEmoji = state === "approved" ? "✅" : state === "changes_requested" ? "🔴" : "💬";
  const al = t("actions." + action) ?? state;
  const descriptionParts: string[] = [];
  descriptionParts.push(t("events.pr_review.action_review", { emoji: stateEmoji, action: al }));

  if (review.body) {
    const truncated = review.body.slice(0, 500);
    descriptionParts.push(`\n> ${truncated}${review.body.length > 500 ? "..." : ""}`);
  }

  return {
    embeds: [
      {
        author,
        title: t("events.pr_review.title", { repo: repo ?? t("common.repository"), number: pr.number ?? "?", title: pr.title ?? t("common.untitled") }),
        url: review.html_url,
        color: GITHUB_COLORS[colorKey],
        description: descriptionParts.join("\n"),
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatPullRequestReviewComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const comment = payload.comment as {
    body?: string;
    path?: string;
    position?: number | null;
    html_url?: string;
  };
  const pr = payload.pull_request as {
    number?: number;
    title?: string;
  };

  const al = t("actions." + action) ?? action;
  const commentBody = comment.body?.slice(0, 400) ?? "";
  const truncated = comment.body && comment.body.length > 400;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (comment.path) {
    const loc = comment.position != null ? t("events.pr_review_comment.line", { position: comment.position }) : "";
    fields.push({
      name: t("fields.file"),
      value: `\`${comment.path}\`${loc}`,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.pr_review_comment.title", { repo: repo ?? t("common.repository"), number: pr.number ?? "?" }),
        url: comment.html_url,
        color: GITHUB_COLORS.pull_request_review_commented,
        description: `${t("events.pr_review_comment.action_inline", { action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatCommitComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const comment = payload.comment as {
    body?: string;
    commit_id?: string;
    html_url?: string;
  };

  const al = t("actions." + action) ?? action;
  const commentBody = comment.body?.slice(0, 500) ?? "";
  const truncated = comment.body && comment.body.length > 500;
  const shortSha = comment.commit_id?.slice(0, 7) ?? "???????";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (comment.commit_id) {
    fields.push({
      name: t("fields.commit"),
      value: `\`${shortSha}\``,
      inline: true,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.commit_comment.title", { sha: shortSha, repo: repo ?? t("common.repository") }),
        url: comment.html_url,
        color: GITHUB_COLORS.commit_comment,
        description: `${t("events.commit_comment.action_comment", { action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatDeploymentStatus(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const status = payload.deployment_status as {
    state?: string;
    environment?: string;
    environment_url?: string;
    description?: string;
  };
  const deployment = payload.deployment as {
    sha?: string;
    ref?: string;
    environment?: string;
  };

  const state = status.state ?? "pending";
  const colorKey =
    state === "success"
      ? "deployment_success"
      : state === "failure"
        ? "deployment_failure"
        : "deployment_pending";
  const emoji = state === "success" ? "✅" : state === "failure" ? "❌" : "⏳";
  const env = status.environment ?? deployment.environment ?? t("common.unknown");
  const shortSha = deployment.sha?.slice(0, 7) ?? "???????";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${emoji} ${state}`,
    inline: true,
  });

  fields.push({
    name: t("fields.environment"),
    value: env,
    inline: true,
  });

  if (deployment.ref) {
    fields.push({
      name: t("fields.branch_tag"),
      value: `\`${deployment.ref}\``,
      inline: true,
    });
  }

  if (deployment.sha) {
    fields.push({
      name: t("fields.commit"),
      value: `\`${shortSha}\``,
      inline: true,
    });
  }

  if (status.environment_url) {
    fields.push({
      name: t("fields.url"),
      value: status.environment_url,
      inline: false,
    });
  }

  if (status.description) {
    fields.push({
      name: t("fields.description"),
      value: status.description,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.deployment.title", { env, state }),
        color: GITHUB_COLORS[colorKey],
        fields,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatMember(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "added";
  const member = payload.member as { login?: string } | undefined;

  const al = t("actions." + action) ?? action;
  const emoji = action === "added" ? "➕" : action === "removed" ? "➖" : "👤";
  const memberName = member?.login ?? t("common.unknown");

  return {
    embeds: [
      {
        author,
        title: t("events.member.title", { emoji, action: al, name: memberName }),
        color: action === "added" ? GITHUB_COLORS.member_added : GITHUB_COLORS.member_removed,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatLabel(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const label = payload.label as {
    name?: string;
    color?: string;
    description?: string;
  };

  const al = t("actions." + action) ?? action;
  const emoji = action === "deleted" ? "🗑️" : action === "edited" ? "✏️" : "🏷️";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (label.name) {
    fields.push({
      name: t("fields.label"),
      value: label.name,
      inline: true,
    });
  }

  if (label.color) {
    fields.push({
      name: t("fields.color"),
      value: `#${label.color}`,
      inline: true,
    });
  }

  if (label.description) {
    fields.push({
      name: t("fields.description"),
      value: label.description,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.label.title", { emoji, action: al, name: label.name ?? t("common.unknown") }),
        color: GITHUB_COLORS.label,
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatMilestone(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
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

  return {
    embeds: [
      {
        author,
        title: t("events.milestone.title", { emoji: stateEmoji, action: al, title: milestone.title ?? t("common.unknown") }),
        url: milestone.html_url,
        color:
          milestone.state === "closed"
            ? GITHUB_COLORS.milestone_closed
            : GITHUB_COLORS.milestone_opened,
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatDiscussion(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const discussion = payload.discussion as {
    number?: number;
    title?: string;
    html_url?: string;
    category?: { name?: string };
  };

  const al = t("actions." + action) ?? action;
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

  return {
    embeds: [
      {
        author,
        title: t("events.discussion.title", { emoji: stateEmoji, number: discussion.number ?? "?", title: discussion.title ?? t("common.untitled") }),
        url: discussion.html_url,
        color:
          action === "answered"
            ? GITHUB_COLORS.discussion_answered
            : GITHUB_COLORS.discussion_created,
        description: t("events.discussion.action_discussion", { action: al, category: category ? ` in **${category}**` : "" }),
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatDiscussionComment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
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
  const commentBody = comment.body?.slice(0, 500) ?? "";
  const truncated = comment.body && comment.body.length > 500;

  return {
    embeds: [
      {
        author,
        title: t("events.discussion_comment.comment_on", { number: discussion.number ?? "?", title: discussion.title ?? t("common.untitled") }),
        url: comment.html_url,
        color: GITHUB_COLORS.discussion_comment,
        description: `${t("events.discussion_comment.action_comment", { action: al })}\n\n> ${commentBody}${truncated ? "..." : ""}`,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatRepository(
  payload: Record<string, unknown>,
  repo: string | undefined,
  repoUrl: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";

  const al = t("actions." + action) ?? action;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (action === "renamed") {
    const changes = payload.changes as { name?: { from?: string } } | undefined;
    const newName = (payload.repository as { full_name?: string })?.full_name ?? t("common.unknown");
    fields.push({
      name: t("fields.renamed"),
      value: changes?.name?.from ? `${changes.name.from} → ${newName}` : newName,
      inline: false,
    });
  }

  if (action === "transferred") {
    const changes = payload.changes as { owner?: { from?: { login?: string } } } | undefined;
    const newOwner =
      (payload.repository as { owner?: { login?: string } })?.owner?.login ?? t("common.unknown");
    fields.push({
      name: t("fields.transferred"),
      value: changes?.owner?.from?.login ? `${changes.owner.from.login} → ${newOwner}` : newOwner,
      inline: false,
    });
  }

  // Enrich create / visibility-change notifications with a clickable link and
  // basic metadata. repoUrl also makes the embed title a hyperlink for all actions.
  const repoData = payload.repository as {
    visibility?: string;
    fork?: boolean;
    description?: string | null;
  };

  const isCreateOrVisibility =
    action === "created" || action === "publicized" || action === "privatized";

  if (isCreateOrVisibility) {
    if (repoData.visibility) {
      fields.push({
        name: t("events.repository.visibility"),
        value: t("events.repository." + repoData.visibility) ?? repoData.visibility,
        inline: true,
      });
    }
    if (repoData.fork) {
      fields.push({
        name: t("common.repository"),
        value: t("events.repository.is_fork"),
        inline: true,
      });
    }
  }

  const descriptionParts: string[] = [];
  if (isCreateOrVisibility && repoUrl) {
    descriptionParts.push(`[${t("events.repository.open")}](${repoUrl})`);
  }
  if (isCreateOrVisibility && repoData.description) {
    descriptionParts.push(`> ${repoData.description}`);
  }

  return {
    embeds: [
      {
        author,
        title: t("events.repository.title", { action: al, repo: repo ?? t("common.repository") }),
        url: repoUrl,
        color: GITHUB_COLORS.repository,
        description: descriptionParts.length > 0 ? descriptionParts.join("\n") : undefined,
        fields: fields.length > 0 ? fields : undefined,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatCodeScanningAlert(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const alert = payload.alert as {
    rule?: { id?: string; severity?: string; description?: string };
    most_recent_instance?: { location?: { path?: string } };
    state?: string;
  };

  const severity = alert.rule?.severity ?? "warning";
  const colorKey =
    severity === "critical"
      ? "code_scanning_critical"
      : severity === "high"
        ? "code_scanning_high"
        : severity === "medium"
          ? "code_scanning_medium"
          : "code_scanning_low";

  const severityEmoji =
    severity === "critical"
      ? "🔴"
      : severity === "high"
        ? "🟠"
        : severity === "medium"
          ? "🟡"
          : "⚪";
  const al = t("actions." + action) ?? action;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.severity"),
    value: `${severityEmoji} ${severity}`,
    inline: true,
  });

  if (alert.rule?.id) {
    fields.push({
      name: t("fields.rule"),
      value: alert.rule.id,
      inline: true,
    });
  }

  if (alert.most_recent_instance?.location?.path) {
    fields.push({
      name: t("fields.file"),
      value: `\`${alert.most_recent_instance.location.path}\``,
      inline: false,
    });
  }

  if (alert.rule?.description) {
    fields.push({
      name: t("fields.description"),
      value: alert.rule.description,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.code_scanning.title", { action: al }),
        color: GITHUB_COLORS[colorKey],
        fields,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatDependabotAlert(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  const action = (payload.action as string) ?? "created";
  const alert = payload.alert as {
    security_advisory?: { severity?: string; summary?: string; description?: string };
    security_vulnerability?: {
      package?: { name?: string };
      vulnerable_version_range?: string;
      first_patched_version?: { identifier?: string };
    };
    state?: string;
    dependency?: { package?: { name?: string } };
    html_url?: string;
  };

  const severity = alert.security_advisory?.severity ?? "medium";
  const colorKey =
    severity === "critical"
      ? "dependabot_critical"
      : severity === "high"
        ? "dependabot_high"
        : severity === "medium"
          ? "dependabot_medium"
          : "dependabot_low";

  const severityEmoji =
    severity === "critical"
      ? "🔴"
      : severity === "high"
        ? "🟠"
        : severity === "medium"
          ? "🟡"
          : "⚪";
  const al = t("actions." + action) ?? action;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.severity"),
    value: `${severityEmoji} ${severity}`,
    inline: true,
  });

  const pkgName = alert.security_vulnerability?.package?.name ?? alert.dependency?.package?.name;
  if (pkgName) {
    fields.push({
      name: t("fields.package"),
      value: pkgName,
      inline: true,
    });
  }

  if (alert.security_vulnerability?.vulnerable_version_range) {
    const patched = alert.security_vulnerability.first_patched_version?.identifier;
    fields.push({
      name: t("fields.vulnerable_range"),
      value: `${alert.security_vulnerability.vulnerable_version_range}${patched ? ` → fix: \`${patched}\`` : ""}`,
      inline: false,
    });
  }

  if (alert.security_advisory?.summary) {
    fields.push({
      name: t("fields.summary"),
      value: alert.security_advisory.summary,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        author,
        title: t("events.dependabot.title", { action: al }),
        url: alert.html_url,
        color: GITHUB_COLORS[colorKey],
        fields,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function formatGeneric(
  eventType: string,
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: { name: string; icon_url?: string; url?: string },
  t: T,
): FormattedMessage {
  return {
    embeds: [
      {
        author,
        title: t("events.generic.title", { event: eventType, action: payload.action ? `: ${payload.action}` : "" }),
        color: GITHUB_COLORS.default,
        footer: { text: t("common.footer", { repo: repo ?? t("common.github") }) },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
