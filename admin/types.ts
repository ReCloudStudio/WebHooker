export interface Filter {
  type: "event" | "repo" | "actor" | "action" | "branch" | "keyword";
  match: string | string[];
  exclude?: boolean;
}

export interface Route {
  id: string;
  name: string;
  enabled: boolean;
  filters: Filter[];
  target: {
    channelId: string;
    threadId?: string;
  };
  lang?: string;
  groupId?: string;
}

export interface Group {
  id: string;
  name: string;
  adminIds: string[];
  owners?: string[];
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
  ts: number;
  routeId: string;
  event: string;
  repo?: string;
  target: string;
  ok: boolean;
  error?: string;
}
