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
