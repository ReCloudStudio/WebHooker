import type { FormattedMessage, NeutralActionStyle, NeutralMessage } from "../../types";
import {
  cap,
  MAX_DESCRIPTION,
  MAX_FIELDS,
  MAX_FIELD_VALUE,
  MAX_FOOTER,
  MAX_TITLE,
  repoUrlFromMessage,
  splitMessageTitle,
} from "../../formatters/helpers";

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
  const rawDescription = subject
    ? message.description
      ? `${subject}\n${message.description}`
      : subject
    : (message.description ?? "");

  // Safety net: clamp every embed part to the Discord API limits so a single
  // oversized formatter or custom payload can never hard-fail the request.
  const footerText = cap(
    [message.forge?.name, message.footer].filter(Boolean).join(" · "),
    MAX_FOOTER,
  );
  return {
    content,
    embeds: [
      {
        title: cap(head, MAX_TITLE),
        url: subject ? repoUrl : message.url,
        color: message.color,
        description: cap(rawDescription, MAX_DESCRIPTION) || undefined,
        author: message.author
          ? {
              name: cap(message.author.name, MAX_TITLE),
              icon_url: message.author.iconUrl,
              url: message.author.url,
            }
          : undefined,
        fields: message.fields
          ?.slice(0, MAX_FIELDS)
          .map((f) => ({
            name: cap(f.name, MAX_TITLE),
            value: cap(f.value, MAX_FIELD_VALUE),
            inline: f.inline,
          })),
        footer: footerText
          ? { text: footerText, icon_url: message.forge?.iconUrl }
          : undefined,
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
