import type { Env, WebhookEvent } from "../../types";
import type { Provider } from "../types";
import { verifyGiteaSignature } from "./verify";
import { parseGiteaEvent } from "./parse";

export const giteaProvider: Provider = {
  id: "gitea",

  matches(headers) {
    return headers["x-gitea-event"] !== undefined;
  },

  async verify(body, headers, env: Env) {
    return verifyGiteaSignature(body, headers["x-gitea-signature"], env.GITEA_WEBHOOK_SECRET);
  },

  parse(body, headers): WebhookEvent | null {
    return parseGiteaEvent(headers, body);
  },
};
