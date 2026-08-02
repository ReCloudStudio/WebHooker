export interface Env {
  GITHUB_WEBHOOK_SECRET: string;
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
  ASSETS?: Fetcher;
  KV: KVNamespace;
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
  /**
   * Fallback route: only fires when no other (non-fallback) route matched the
   * event. Multiple fallback routes may exist; they are all skipped whenever at
   * least one regular route matches. Its own filters are ignored.
   */
  fallback?: boolean;
}

export interface Group {
  id: string;
  name: string;
  /**
   * GitHub user ids or logins (case-insensitive) allowed to manage this group.
   * Super admins (ADMIN_USER_IDS) always have access regardless of this list.
   */
  adminIds: string[];
  /**
   * GitHub organization/user logins (case-insensitive) whose webhook events are
   * allowed into this group's routes. Empty/omitted = no owner restriction.
   * Only super admins may edit this field.
   */
  owners?: string[];
  /**
   * Whether to include emoji in messages sent through this group's routes.
   * Defaults to true when omitted.
   */
  emoji?: boolean;
}

export interface Filter {
  type: "event" | "repo" | "actor" | "action" | "branch" | "keyword";
  match: string | string[];
  exclude?: boolean;
}

export interface WebhookEvent {
  event: string;
  payload: Record<string, unknown>;
  signature?: string;
}

export interface FormattedMessage {
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
