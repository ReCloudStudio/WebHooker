import type { EventFormatter } from "./types";
import { formatPush } from "./push";
import { formatPullRequest } from "./pull-request";
import { formatPullRequestReview, formatPullRequestReviewComment } from "./review";
import { formatIssues } from "./issues";
import { formatIssueComment } from "./comments";
import { formatWorkflowRun, formatWorkflowJob } from "./workflow";
import { formatRelease } from "./release";
import { formatCreate, formatDelete } from "./create";
import { formatStar, formatFork } from "./repo";
import { formatCheckRun, formatCheckSuite, formatStatus } from "./check";
import { formatCommitComment } from "./commit-comment";
import { formatDeployment, formatDeploymentStatus } from "./deployment";
import { formatMember } from "./member";
import { formatLabel } from "./label";
import { formatMilestone } from "./milestone";
import { formatDiscussion, formatDiscussionComment } from "./discussion";
import { formatRepository } from "./repository";
import { formatCodeScanningAlert, formatDependabotAlert } from "./security";
import { formatPing } from "./ping";
import { formatCustom } from "./custom";

export const eventFormatters: EventFormatter[] = [
  { events: ["push"], format: (c) => formatPush(c.payload, c.repo, c.author, c.t, c.showEmoji) },
  {
    events: ["pull_request"],
    format: (c) => formatPullRequest(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["pull_request_review"],
    format: (c) => formatPullRequestReview(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["pull_request_review_comment"],
    format: (c) => formatPullRequestReviewComment(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["issues"],
    format: (c) => formatIssues(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["issue_comment"],
    format: (c) => formatIssueComment(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["workflow_run"],
    format: (c) => formatWorkflowRun(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["workflow_job"],
    format: (c) => formatWorkflowJob(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["status"],
    format: (c) => formatStatus(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["deployment"],
    format: (c) => formatDeployment(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  { events: ["ping"], format: (c) => formatPing(c.payload, c.repo, c.author, c.t, c.showEmoji) },
  {
    events: ["release"],
    format: (c) => formatRelease(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["create"],
    format: (c) => formatCreate(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["delete"],
    format: (c) => formatDelete(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["star"],
    format: (c) => formatStar(c.payload, c.repo, c.repoUrl, c.author, c.t, c.showEmoji),
  },
  {
    events: ["fork"],
    format: (c) => formatFork(c.payload, c.repo, c.repoUrl, c.author, c.t, c.showEmoji),
  },
  {
    events: ["check_run"],
    format: (c) => formatCheckRun(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["check_suite"],
    format: (c) => formatCheckSuite(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["commit_comment"],
    format: (c) => formatCommitComment(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["deployment_status"],
    format: (c) => formatDeploymentStatus(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["member"],
    format: (c) => formatMember(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  { events: ["label"], format: (c) => formatLabel(c.payload, c.repo, c.author, c.t, c.showEmoji) },
  {
    events: ["milestone"],
    format: (c) => formatMilestone(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["discussion"],
    format: (c) => formatDiscussion(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["discussion_comment"],
    format: (c) => formatDiscussionComment(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["repository"],
    format: (c) => formatRepository(c.payload, c.repo, c.repoUrl, c.author, c.t, c.showEmoji),
  },
  {
    events: ["code_scanning_alert"],
    format: (c) => formatCodeScanningAlert(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["dependabot_alert"],
    format: (c) => formatDependabotAlert(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
  {
    events: ["custom"],
    format: (c) => formatCustom(c.payload, c.repo, c.author, c.t, c.showEmoji),
  },
];

export function findFormatter(eventType: string): EventFormatter | undefined {
  return eventFormatters.find((f) => f.events.includes(eventType));
}
