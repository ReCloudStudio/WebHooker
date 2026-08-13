import type { Provider } from "./types";
import { githubProvider } from "./github";
import { giteaProvider } from "./gitea";
import { customProvider } from "./custom";

export type { Provider } from "./types";
export { verifySignature } from "./github/verify";

/**
 * Detection order matters: Gitea webhooks also send GitHub-compatible headers
 * (`X-GitHub-Event`, `X-Hub-Signature-256`, ...), so a Gitea request would
 * match the GitHub provider too. Check Gitea first — real GitHub requests
 * never send `X-Gitea-Event`. Custom requests carry none of the forge headers,
 * only `X-WebHooker-Signature`, so they are checked last.
 */
const providers: Provider[] = [giteaProvider, githubProvider, customProvider];

/**
 * Pick the webhook provider for a request based on its headers (e.g.
 * `X-GitHub-Event` / `X-Gitea-Event`). Returns null when no provider matches.
 */
export function detectProvider(headers: Record<string, string>): Provider | null {
  return providers.find((p) => p.matches(headers)) ?? null;
}
