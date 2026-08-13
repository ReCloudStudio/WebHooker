import type { Env, WebhookEvent } from "../../types";
import type { Provider } from "../types";
import { verifySignature } from "./verify";
import { parseEvent } from "./parse";

export const githubProvider: Provider = {
  id: "github",

  matches(headers) {
    return headers["x-github-event"] !== undefined;
  },

  async verify(body, headers, env: Env) {
    return verifySignature(body, headers["x-hub-signature-256"], env.GITHUB_WEBHOOK_SECRET);
  },

  parse(body, headers): WebhookEvent | null {
    return parseEvent(headers, body);
  },
};
