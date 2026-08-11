export interface Filter {
  type: "event" | "repo" | "actor" | "action" | "branch" | "keyword";
  match: string | string[];
  exclude?: boolean;
}

export interface RouteTarget {
  platform?: "discord" | "telegram";
  channelId?: string;
  threadId?: string;
  chatId?: string;
  topicId?: string;
}

export interface Route {
  id: string;
  name: string;
  enabled: boolean;
  filters: Filter[];
  targets: RouteTarget[];
  lang?: string;
  groupId?: string;
  fallback?: boolean;
  stop?: boolean;
  discordRoleIds?: string[];
}

export interface Group {
  id: string;
  name: string;
  adminIds: string[];
  owners?: string[];
  emoji?: boolean;
}

export interface Me {
  login: string;
  userId: string;
  isSuper: boolean;
  groups: Group[];
}

export interface RouteTemplate {
  id: string;
  nameKey: string;
  filters: Filter[];
}

export const ROUTE_TEMPLATES: RouteTemplate[] = [
  {
    id: "push-events",
    nameKey: "templates.push",
    filters: [{ type: "event", match: "push" }],
  },
  {
    id: "pull-requests",
    nameKey: "templates.pullRequest",
    filters: [
      { type: "event", match: "pull_request" },
      { type: "action", match: ["opened", "synchronize", "reopened", "closed"] },
    ],
  },
  {
    id: "issues",
    nameKey: "templates.issues",
    filters: [
      { type: "event", match: "issues" },
      { type: "action", match: ["opened", "edited", "closed", "reopened"] },
    ],
  },
  {
    id: "releases",
    nameKey: "templates.release",
    filters: [
      { type: "event", match: "release" },
      { type: "action", match: ["published"] },
    ],
  },
  {
    id: "workflows",
    nameKey: "templates.workflow",
    filters: [{ type: "event", match: "workflow_run" }],
  },
  {
    id: "checks",
    nameKey: "templates.checks",
    filters: [{ type: "event", match: ["check_suite"] }],
  },
  {
    id: "deployments",
    nameKey: "templates.deployment",
    filters: [{ type: "event", match: "deployment" }],
  },
  {
    id: "comments",
    nameKey: "templates.comments",
    filters: [{ type: "event", match: ["issue_comment", "pull_request_review_comment"] }],
  },
  {
    id: "reviews",
    nameKey: "templates.reviews",
    filters: [{ type: "event", match: "pull_request_review" }],
  },
  {
    id: "star-fork",
    nameKey: "templates.starFork",
    filters: [{ type: "event", match: ["star", "fork"] }],
  },
  {
    id: "create-delete",
    nameKey: "templates.createDelete",
    filters: [{ type: "event", match: ["create", "delete"] }],
  },
  {
    id: "members",
    nameKey: "templates.member",
    filters: [{ type: "event", match: "member" }],
  },
  {
    id: "commit-comments",
    nameKey: "templates.commitComment",
    filters: [{ type: "event", match: "commit_comment" }],
  },
];

export const FILTER_TYPES = ["event", "repo", "actor", "action", "branch", "keyword"] as const;

export const FILTER_LABELS: Record<string, string> = {
  event: "Event",
  repo: "Repo",
  actor: "Actor",
  action: "Action",
  branch: "Branch",
  keyword: "Keyword",
};

export function fmtMatch(match: string | string[]): string {
  if (Array.isArray(match)) return match.join(", ");
  return String(match ?? "");
}

export interface SendRecord {
  id?: number;
  ts: number;
  routeId: string;
  groupId?: string;
  event: string;
  repo?: string;
  target: string;
  ok: boolean;
  error?: string;
  status?: number;
  messageId?: string;
  deliveryId?: string;
  platform?: string;
  actor?: string;
  action?: string;
  durationMs?: number;
  errorCode?: string;
  attempts?: number;
  detail?: Record<string, unknown>;
}
