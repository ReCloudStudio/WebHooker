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
  DISCORD_GATEWAY_ENABLED?: string;
  ASSETS?: Fetcher;
  KV: KVNamespace;
  DISCORD_GATEWAY: DurableObjectNamespace;
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
}
