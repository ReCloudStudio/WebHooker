import type { RouteTarget, Env, NeutralMessage } from "../types";

export interface SendResult {
  ok: boolean;
  error?: string;
  errorCode?: string;
  status?: number;
  messageId?: string;
  attempts?: number;
}

export interface PlatformDriver {
  readonly id: string;
  send(message: NeutralMessage, target: RouteTarget, env: Env): Promise<SendResult>;
  /**
   * Edit an already-sent message in place (e.g. workflow run progress updates).
   * Must be implemented by drivers that support message updates.
   */
  edit(
    message: NeutralMessage,
    target: RouteTarget,
    env: Env,
    messageId: string,
  ): Promise<SendResult>;
}
