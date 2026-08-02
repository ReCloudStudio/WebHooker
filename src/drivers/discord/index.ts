import type { RouteTarget, Env, NeutralMessage } from "../../types";
import type { PlatformDriver, SendResult } from "../types";
import { sendMessage } from "./rest";
import { renderNeutralMessage } from "./render";

export class DiscordDriver implements PlatformDriver {
  readonly id = "discord";

  async send(message: NeutralMessage, target: RouteTarget, env: Env): Promise<SendResult> {
    const channelId = target.channelId ?? "";
    if (!channelId) {
      return { ok: false, error: "target.channelId is required", errorCode: "NO_TARGET" };
    }
    const token = env.DISCORD_TOKEN ?? "";
    return sendMessage(token, channelId, renderNeutralMessage(message), target.threadId);
  }
}
