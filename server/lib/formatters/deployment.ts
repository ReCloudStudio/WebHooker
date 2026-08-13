import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import {
  branchLink,
  commitLink,
  emojiPrefix,
  tagLink,
  type T,
  buildMessage,
  repoBaseUrl,
} from "./helpers";

export function formatDeployment(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const deployment = payload.deployment as {
    environment?: string;
    ref?: string;
    sha?: string;
    description?: string;
    html_url?: string;
    statuses_url?: string;
  };

  const emoji = "🚀";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const env = deployment.environment ?? t("common.unknown");
  const shortSha = deployment.sha?.slice(0, 7) ?? "???????";
  const baseUrl = repoBaseUrl(payload, repo);
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}created`,
    inline: true,
  });

  fields.push({
    name: t("fields.environment"),
    value: env,
    inline: true,
  });

  if (deployment.ref) {
    const isTag = deployment.ref.startsWith("refs/tags/");
    fields.push({
      name: t("fields.branch_tag"),
      value: isTag ? tagLink(baseUrl, deployment.ref) : branchLink(baseUrl, deployment.ref),
      inline: true,
    });
  }

  if (deployment.sha) {
    fields.push({
      name: t("fields.commit"),
      value: commitLink(baseUrl, deployment.sha, shortSha),
      inline: true,
    });
  }

  if (deployment.description) {
    fields.push({
      name: t("fields.description"),
      value: deployment.description,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.deployment.title", {
        repo: repo ?? t("common.repository"),
        env,
        state: "created",
      }),
      url: deployment.html_url ?? deployment.statuses_url,
      color: GITHUB_COLORS.deployment_pending,
      fields,
    },
    t,
    repo,
  );
}

export function formatDeploymentStatus(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
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
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const env = status.environment ?? deployment.environment ?? t("common.unknown");
  const shortSha = deployment.sha?.slice(0, 7) ?? "???????";
  const baseUrl = repoBaseUrl(payload, repo);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.status"),
    value: `${em(emoji)}${status}`,
    inline: true,
  });

  fields.push({
    name: t("fields.environment"),
    value: env,
    inline: true,
  });

  if (deployment.ref) {
    const isTag = deployment.ref.startsWith("refs/tags/");
    fields.push({
      name: t("fields.branch_tag"),
      value: isTag ? tagLink(baseUrl, deployment.ref) : branchLink(baseUrl, deployment.ref),
      inline: true,
    });
  }

  if (deployment.sha) {
    fields.push({
      name: t("fields.commit"),
      value: commitLink(baseUrl, deployment.sha, shortSha),
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

  return buildMessage(
    {
      author,
      title: t("events.deployment.title", { repo: repo ?? t("common.repository"), env, state }),
      color: GITHUB_COLORS[colorKey],
      fields,
    },
    t,
    repo,
  );
}
