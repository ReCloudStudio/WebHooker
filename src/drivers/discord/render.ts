import type { FormattedMessage, NeutralActionStyle, NeutralMessage } from "../../types";

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
  return {
    content,
    embeds: [
      {
        title: message.title,
        url: message.url,
        color: message.color,
        description: message.description,
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
