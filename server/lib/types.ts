export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  GITEA_WEBHOOK_SECRET?: string;
  GITHUB_APP_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  DISCORD_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
  BASE_URL?: string;
  ADMIN_USER_IDS?: string;
  LEGAL_CONTACT?: string;
  DOCS_URL?: string;
  GITHUB_REPO_URL?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_APPLICATION_ID?: string;
  TELEGRAM_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_RICH_HEADER_HOST?: string;
  /**
   * When enabled ("1"/"true"), GitHub users without any group access get a
   * personal group on first login instead of being blocked.
   */
  ALLOW_SELF_SIGNUP?: string;
  /** Audit log retention in days (default 90). */
  AUDIT_RETENTION_DAYS?: string;
  ASSETS?: Fetcher;
  KV: KVNamespace;
  DB: D1Database;
}

export interface Config {
  baseUrl: string;
  github: {
    webhookSecret: string;
    appId: number;
    privateKey: string;
    clientId: string;
    clientSecret: string;
  };
  discord: {
    token: string;
  };
  routes: Route[];
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
  groupId?: string;
  /**
   * Fallback route: only fires when no other (non-fallback) route matched the
   * event. Multiple fallback routes may exist; they are all skipped whenever at
   * least one regular route matches. Its own filters are ignored.
   */
  fallback?: boolean;
  /**
   * Stop: when true and this route matches, no further routes are evaluated
   * for this event. Useful for exclusive routing where a match should prevent
   * fallthrough to subsequent routes.
   */
  stop?: boolean;
  /**
   * Discord role (身份组) ids to mention/notify when this route fires. Roles
   * are only mentioned in Discord targets; Telegram targets ignore this field.
   */
  discordRoleIds?: string[];
}

export type GroupRole = "owner" | "admin" | "viewer";

export interface GroupMember {
  /**
   * GitHub login (case-insensitive). Ids are matched when stored, logins
   * otherwise; identityMatches handles both.
   */
  login: string;
  role: GroupRole;
}

export interface Group {
  id: string;
  name: string;
  /**
   * Deprecated legacy field: GitHub user ids or logins allowed to manage this
   * group. Kept for backward compatibility — when `members` is absent, these
   * are normalized to `members` with role "owner". New writes use `members`.
   */
  adminIds: string[];
  /**
   * Group members with roles. Roles: owner (manage group + members + invites),
   * admin (manage routes), viewer (read-only). Super admins always bypass.
   */
  members?: GroupMember[];
  /**
   * GitHub organization/user logins (case-insensitive) whose webhook events are
   * allowed into this group's routes. Empty/omitted = no owner restriction.
   * Only super admins may edit this field.
   */
  owners?: string[];
  /**
   * Webhook providers (source platforms) allowed into this group's routes
   * (e.g. `["github"]`, `["gitea"]`). Empty/omitted = all providers.
   */
  providers?: WebhookProvider[];
  /**
   * GitHub App installation id bound to this group. When set, only webhook
   * events coming from that installation (org/user) are accepted into the
   * group's routes — hard tenant isolation on top of (or instead of) the
   * `owners` list. Empty/omitted = no installation restriction.
   */
  installationId?: number;
  /**
   * Whether to include emoji in messages sent through this group's routes.
   * Defaults to true when omitted.
   */
  emoji?: boolean;
  /**
   * Message language for every route in this group (e.g. "en", "zh"; custom
   * via KV i18n:<lang>). Defaults to "en" when omitted.
   */
  lang?: string;
  /**
   * Discord channel/thread or Telegram chat/topic that receives a summary of
   * every webhook this group's routes dispatch (the group's webhook log).
   */
  logTarget?: RouteTarget;
}

export interface Filter {
  type: "event" | "repo" | "actor" | "action" | "branch" | "keyword";
  match: string | string[];
  exclude?: boolean;
}

export type WebhookProvider = "github" | "gitea" | "gitlab" | "custom";

export interface WebhookEvent {
  event: string;
  payload: Record<string, unknown>;
  signature?: string;
  deliveryId?: string;
  provider?: WebhookProvider;
  /**
   * GitHub App installation id that produced this event (extracted from
   * `payload.installation.id`). Gitea/custom events have none.
   */
  installationId?: number;
}

export interface NeutralAuthor {
  name: string;
  iconUrl?: string;
  url?: string;
}

export interface NeutralField {
  name: string;
  value: string;
  inline?: boolean;
}

export type NeutralActionStyle = "primary" | "danger" | "secondary";

export interface NeutralAction {
  id: string;
  label: string;
  style: NeutralActionStyle;
}

export interface NeutralMessage {
  author?: NeutralAuthor;
  title: string;
  url?: string;
  color?: number;
  description?: string;
  fields?: NeutralField[];
  footer?: string;
  timestamp?: string;
  actions?: NeutralAction[];
  /**
   * Stable key identifying a message chain that should be updated in place
   * (e.g. workflow run progress). When set, subsequent events edit the
   * previously sent message instead of sending a new one.
   */
  updateKey?: string;
  /**
   * Discord role ids to mention in the message content (set by dispatch from
   * the route's `discordRoleIds`). Only used by the Discord driver.
   */
  mentionRoleIds?: string[];
}

export interface FormattedMessage {
  content?: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    author?: {
      name: string;
      icon_url?: string;
      url?: string;
    };
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  }>;
  components?: Array<{
    type: number;
    components: Array<{
      type: number;
      style?: number;
      label?: string;
      custom_id?: string;
    }>;
  }>;
}
