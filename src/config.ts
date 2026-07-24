import type { Env, Config, Route } from "./types";
import { log } from "./log";

const DEFAULT_ROUTES: Route[] = [
  {
    id: "all-push",
    name: "All Push Events",
    enabled: true,
    filters: [{ type: "event", match: "push" }],
    target: { channelId: "" },
  },
  {
    id: "pull-requests",
    name: "Pull Requests",
    enabled: true,
    filters: [{ type: "event", match: "pull_request" }],
    target: { channelId: "" },
  },
  {
    id: "issues",
    name: "Issues",
    enabled: true,
    filters: [{ type: "event", match: "issues" }],
    target: { channelId: "" },
  },
  {
    id: "issue-comments",
    name: "Issue Comments",
    enabled: true,
    filters: [{ type: "event", match: "issue_comment" }],
    target: { channelId: "" },
  },
  {
    id: "workflow-runs",
    name: "Workflow Runs",
    enabled: true,
    filters: [{ type: "event", match: "workflow_run" }],
    target: { channelId: "" },
  },
  {
    id: "releases",
    name: "Releases",
    enabled: true,
    filters: [{ type: "event", match: "release" }],
    target: { channelId: "" },
  },
  {
    id: "branch-activity",
    name: "Branch Create/Delete",
    enabled: true,
    filters: [{ type: "event", match: ["create", "delete"] }],
    target: { channelId: "" },
  },
];

export async function loadConfig(env: Env): Promise<Config> {
  let routes = DEFAULT_ROUTES;

  try {
    const stored = await env.KV.get("config:routes", "json");
    if (stored) {
      routes = stored as Route[];
    }
  } catch (err) {
    log.warn({ err }, "Failed to load routes from KV, using defaults");
  }

  const defaultChannelId = env.DISCORD_CHANNEL_ID ?? "";

  routes = routes.map((r) => ({
    ...r,
    target: { ...r.target, channelId: r.target.channelId || defaultChannelId },
  }));

  return {
    baseUrl: env.BASE_URL ?? "https://webhooker.example.workers.dev",
    github: {
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      appId: Number(env.GITHUB_APP_ID ?? 0),
      privateKey: env.GITHUB_PRIVATE_KEY ?? "",
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    },
    discord: {
      token: env.DISCORD_TOKEN ?? "",
      defaultChannelId,
    },
    routes,
  };
}
