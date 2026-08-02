import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatRepository(
  payload: Record<string, unknown>,
  repo: string | undefined,
  repoUrl: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";

  const al = t("actions." + action) ?? action;
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (action === "renamed") {
    const changes = payload.changes as { name?: { from?: string } } | undefined;
    const newName =
      (payload.repository as { full_name?: string })?.full_name ?? t("common.unknown");
    fields.push({
      name: t("fields.renamed"),
      value: changes?.name?.from ? `${changes.name.from} → ${newName}` : newName,
      inline: false,
    });
  }

  if (action === "transferred") {
    const changes = payload.changes as { owner?: { from?: { login?: string } } } | undefined;
    const newOwner =
      (payload.repository as { owner?: { login?: string } })?.owner?.login ?? t("common.unknown");
    fields.push({
      name: t("fields.transferred"),
      value: changes?.owner?.from?.login ? `${changes.owner.from.login} → ${newOwner}` : newOwner,
      inline: false,
    });
  }

  const repoData = payload.repository as {
    visibility?: string;
    fork?: boolean;
    description?: string | null;
  };

  const isCreateOrVisibility =
    action === "created" || action === "publicized" || action === "privatized";

  if (isCreateOrVisibility) {
    if (repoData.visibility) {
      fields.push({
        name: t("events.repository.visibility"),
        value: t("events.repository." + repoData.visibility) ?? repoData.visibility,
        inline: true,
      });
    }
    if (repoData.fork) {
      fields.push({
        name: t("common.repository"),
        value: t("events.repository.is_fork"),
        inline: true,
      });
    }
  }

  const descriptionParts: string[] = [];
  if (isCreateOrVisibility && repoUrl) {
    descriptionParts.push(`[${em("🔗")}${t("events.repository.open")}](${repoUrl})`);
  }
  if (isCreateOrVisibility && repoData.description) {
    descriptionParts.push(`> ${repoData.description}`);
  }

  return buildMessage(
    {
      author,
      title: t("events.repository.title", {
        repo: repo ?? t("common.repository"),
        emoji: em("📦"),
        action: al,
      }),
      url: repoUrl,
      color: GITHUB_COLORS.repository,
      description: descriptionParts.length > 0 ? descriptionParts.join("\n") : undefined,
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
