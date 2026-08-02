import type { Route, Env, NeutralMessage } from "../../types";
import type { PlatformDriver, SendResult } from "../types";
import { sendMessage } from "./rest";
import { renderNeutralMessage } from "./render";

export class DiscordDriver implements PlatformDriver {
  readonly id = "discord";

  async send(
    message: NeutralMessage,
    target: Route["target"],
    env: Env,
  ): Promise<SendResult> {
    const token = env.DISCORD_TOKEN ?? "";
    return sendMessage(token, target.channelId, renderNeutralMessage(message), target.threadId);
  }
}
