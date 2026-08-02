import type { RouteTarget, Env, NeutralMessage } from "../../types";
import type { PlatformDriver, SendResult } from "../types";
import { sendMessage, sendPhoto } from "./rest";
import { renderNeutralMessage } from "./render";

function smallAvatar(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}s=64`;
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
    if (avatar) {
      return sendPhoto(token, chatId, smallAvatar(avatar), text, target.topicId);
    }
    return sendMessage(token, chatId, text, target.topicId);
  }
}
