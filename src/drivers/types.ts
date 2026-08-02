import type { Route, Env, NeutralMessage } from "../types";

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
  send(message: NeutralMessage, target: Route["target"], env: Env): Promise<SendResult>;
}
