import type { Route, WebhookEvent, NeutralMessage, NeutralAuthor } from "../types";
import type { Translations } from "../lib/i18n";
import { makeT, type T } from "./helpers";
import { formatPush } from "./push";
import { formatPullRequest } from "./pull-request";
import { formatPullRequestReview, formatPullRequestReviewComment } from "./review";
import { formatIssues } from "./issues";
import { formatIssueComment } from "./comments";
import { formatWorkflowRun } from "./workflow";
import { formatRelease } from "./release";
import { formatCreate, formatDelete } from "./create";
import { formatStar, formatFork } from "./repo";
import { formatCheckRun } from "./check";
import { formatCommitComment } from "./commit-comment";
import { formatDeploymentStatus } from "./deployment";
import { formatMember } from "./member";
import { formatLabel } from "./label";
import { formatMilestone } from "./milestone";
import { formatDiscussion, formatDiscussionComment } from "./discussion";
import { formatRepository } from "./repository";
import { formatCodeScanningAlert, formatDependabotAlert } from "./security";
import { formatGeneric } from "./generic";

export type { T } from "./helpers";
export { formatPush } from "./push";
export { formatPullRequest } from "./pull-request";
export { formatPullRequestReview, formatPullRequestReviewComment } from "./review";
export { formatIssues } from "./issues";
export { formatIssueComment } from "./comments";
export { formatWorkflowRun } from "./workflow";
export { formatRelease } from "./release";
export { formatCreate, formatDelete } from "./create";
export { formatStar, formatFork } from "./repo";
export { formatCheckRun } from "./check";
export { formatCommitComment } from "./commit-comment";
export { formatDeploymentStatus } from "./deployment";
export { formatMember } from "./member";
export { formatLabel } from "./label";
export { formatMilestone } from "./milestone";
export { formatDiscussion, formatDiscussionComment } from "./discussion";
export { formatRepository } from "./repository";
export { formatCodeScanningAlert, formatDependabotAlert } from "./security";
export { formatGeneric } from "./generic";

export function formatEvent(
  route: Route,
  event: WebhookEvent,
  tr?: Translations,
  showEmoji = true,
): NeutralMessage {
  const { event: eventType, payload } = event;
  const repo = (payload.repository as { full_name?: string })?.full_name;
  const sender = (payload.sender as { login?: string })?.login;
  const senderAvatar = (payload.sender as { avatar_url?: string })?.avatar_url;
  const repoUrl = (payload.repository as { html_url?: string })?.html_url;

  const t: T = makeT(tr);

  const author: NeutralAuthor = {
    name: sender ?? t("common.unknown"),
    iconUrl: senderAvatar,
    url: sender ? `https://github.com/${sender}` : undefined,
  };

  switch (eventType) {
    case "push":
      return formatPush(payload, repo, author, t, showEmoji);
    case "pull_request":
      return formatPullRequest(payload, repo, author, t, showEmoji);
    case "pull_request_review":
      return formatPullRequestReview(payload, repo, author, t, showEmoji);
    case "pull_request_review_comment":
      return formatPullRequestReviewComment(payload, repo, author, t, showEmoji);
    case "issues":
      return formatIssues(payload, repo, author, t, showEmoji);
    case "issue_comment":
      return formatIssueComment(payload, repo, author, t, showEmoji);
    case "workflow_run":
      return formatWorkflowRun(payload, repo, author, t, showEmoji);
    case "release":
      return formatRelease(payload, repo, author, t, showEmoji);
    case "create":
      return formatCreate(payload, repo, author, t, showEmoji);
    case "delete":
      return formatDelete(payload, repo, author, t, showEmoji);
    case "star":
      return formatStar(payload, repo, repoUrl, author, t, showEmoji);
    case "fork":
      return formatFork(payload, repo, repoUrl, author, t, showEmoji);
    case "check_run":
      return formatCheckRun(payload, repo, author, t, showEmoji);
    case "commit_comment":
      return formatCommitComment(payload, repo, author, t, showEmoji);
    case "deployment_status":
      return formatDeploymentStatus(payload, repo, author, t, showEmoji);
    case "member":
      return formatMember(payload, repo, author, t, showEmoji);
    case "label":
      return formatLabel(payload, repo, author, t, showEmoji);
    case "milestone":
      return formatMilestone(payload, repo, author, t, showEmoji);
    case "discussion":
      return formatDiscussion(payload, repo, author, t, showEmoji);
    case "discussion_comment":
      return formatDiscussionComment(payload, repo, author, t, showEmoji);
    case "repository":
      return formatRepository(payload, repo, repoUrl, author, t, showEmoji);
    case "code_scanning_alert":
      return formatCodeScanningAlert(payload, repo, author, t, showEmoji);
    case "dependabot_alert":
      return formatDependabotAlert(payload, repo, author, t, showEmoji);
    default:
      return formatGeneric(eventType, payload, repo, author, t, showEmoji);
  }
}
