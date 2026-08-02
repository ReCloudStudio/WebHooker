import type { Route, Env, NeutralMessage } from "../../types";
import type { PlatformDriver, SendResult } from "../types";

export class TelegramDriver implements PlatformDriver {
  readonly id = "telegram";

  async send(_message: NeutralMessage, _target: Route["target"], _env: Env): Promise<SendResult> {
    return { ok: false, error: "Telegram driver not implemented yet" };
  }
}
