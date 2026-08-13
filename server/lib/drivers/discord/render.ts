import type { FormattedMessage, NeutralActionStyle, NeutralMessage } from "../../types";
import { repoUrlFromMessage, splitMessageTitle } from "../../formatters/helpers";

function toStyle(style: NeutralActionStyle): number {
  switch (style) {
    case "primary":
      return 3;
    case "danger":
      return 4;
    default:
      return 2;
  }
}

export function renderNeutralMessage(message: NeutralMessage): FormattedMessage {
  const content = message.mentionRoleIds?.length
    ? message.mentionRoleIds.map((id) => `<@&${id}>`).join(" ")
    : undefined;

  // Discord embed titles can only be linked as a whole, so only the repo head
  // goes into the title (linked to the repository); the `: subject` text is
  // rendered as the first line of the description, unlinked.
  const { head, subject } = splitMessageTitle(message.title);
  const repoUrl = repoUrlFromMessage(message.url);
  const description = subject
    ? message.description
      ? `${subject}\n${message.description}`
      : subject
    : message.description;

  return {
    content,
    embeds: [
      {
        title: head,
        url: subject ? repoUrl : message.url,
        color: message.color,
        description,
        author: message.author
          ? {
              name: message.author.name,
              icon_url: message.author.iconUrl,
              url: message.author.url,
            }
          : undefined,
        fields: message.fields,
        footer: message.footer ? { text: message.footer } : undefined,
        timestamp: message.timestamp,
      },
    ],
    components: message.actions?.length
      ? [
          {
            type: 1,
            components: message.actions.map((action) => ({
              type: 2,
              style: toStyle(action.style),
              label: action.label,
              custom_id: action.id,
            })),
          },
        ]
      : undefined,
  };
}
