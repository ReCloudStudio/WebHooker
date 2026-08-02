import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

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
    fields.push({
      name: t("fields.branch_tag"),
      value: `\`${deployment.ref}\``,
      inline: true,
    });
  }

  if (deployment.sha) {
    fields.push({
      name: t("fields.commit"),
      value: `\`${shortSha}\``,
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
