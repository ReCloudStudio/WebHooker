import type { RouteTarget, Env, NeutralMessage } from "../../types";
import type { PlatformDriver, SendResult } from "../types";
import { sendMessage, sendPhoto, editMessageText, editMessageCaption } from "./rest";
import { renderNeutralMessage } from "./render";

function smallAvatar(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}s=64`;
}

function richHeaderUrl(message: NeutralMessage, avatar: string, host: string): string {
  const params = new URLSearchParams();
  if (message.author?.name) params.set("title", message.author.name);
  if (message.title) params.set("content", message.title);
  params.set("avatar", avatar);
  return `${host.replace(/\/+$/, "")}/api/richheader?${params.toString()}`;
}

export class TelegramDriver implements PlatformDriver {
  readonly id = "telegram";

  async send(message: NeutralMessage, target: RouteTarget, env: Env): Promise<SendResult> {
    const chatId = target.chatId ?? "";
    if (!chatId) {
      return { ok: false, error: "target.chatId is required", errorCode: "NO_TARGET" };
    }
    const token = env.TELEGRAM_TOKEN ?? "";
    const text = renderNeutralMessage(message);
    const avatar = message.author?.iconUrl;
    const richHeaderHost = env.TELEGRAM_RICH_HEADER_HOST ?? env.BASE_URL;
    if (avatar && richHeaderHost) {
      const rhUrl = richHeaderUrl(message, avatar, richHeaderHost);
      return sendMessage(token, chatId, text, target.topicId, rhUrl);
    }
    if (avatar) {
      return sendPhoto(token, chatId, smallAvatar(avatar), text, target.topicId);
    }
    return sendMessage(token, chatId, text, target.topicId);
  }

  async edit(
    message: NeutralMessage,
    target: RouteTarget,
    env: Env,
    messageId: string,
  ): Promise<SendResult> {
    const chatId = target.chatId ?? "";
    if (!chatId) {
      return { ok: false, error: "target.chatId is required", errorCode: "NO_TARGET" };
    }
    const token = env.TELEGRAM_TOKEN ?? "";
    const text = renderNeutralMessage(message);
    const avatar = message.author?.iconUrl;
    const richHeaderHost = env.TELEGRAM_RICH_HEADER_HOST ?? env.BASE_URL;
    if (avatar && richHeaderHost) {
      const rhUrl = richHeaderUrl(message, avatar, richHeaderHost);
      return editMessageText(token, chatId, messageId, text, target.topicId, rhUrl);
    }
    if (avatar) {
      return editMessageCaption(token, chatId, messageId, text, target.topicId);
    }
    return editMessageText(token, chatId, messageId, text, target.topicId);
  }
}
