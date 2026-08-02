import type { RouteTarget, Env, NeutralMessage } from "../../types";
import type { PlatformDriver, SendResult } from "../types";
import { sendMessage } from "./rest";
import { renderNeutralMessage } from "./render";

export class TelegramDriver implements PlatformDriver {
  readonly id = "telegram";

  async send(message: NeutralMessage, target: RouteTarget, env: Env): Promise<SendResult> {
    const chatId = target.chatId ?? "";
    if (!chatId) {
      return { ok: false, error: "target.chatId is required", errorCode: "NO_TARGET" };
    }
    const token = env.TELEGRAM_TOKEN ?? "";
    return sendMessage(token, chatId, renderNeutralMessage(message), target.topicId);
  }
}
