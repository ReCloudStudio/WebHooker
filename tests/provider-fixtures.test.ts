import { describe, test, expect } from "bun:test";
import { formatEvent } from "../server/lib/formatters";
import { detectProvider } from "../server/lib/providers";
import type { Route, WebhookEvent } from "../server/lib/types";
import { githubPush, githubPullRequest, githubIssues, giteaPush, customPayload } from "./fixtures";

const route: Route = {
  id: "test",
  name: "Test",
  enabled: true,
  filters: [],
  targets: [{ channelId: "111" }],
};

function event(ev: string, payload: Record<string, unknown>): WebhookEvent {
  return { event: ev, payload };
}

describe("provider fixtures", () => {
  const githubFixtures = [
    { event: "push", payload: githubPush },
    { event: "pull_request", payload: githubPullRequest },
    { event: "issues", payload: githubIssues },
  ];

  for (const { event: ev, payload } of githubFixtures) {
    test(`formats github ${ev} with a title`, () => {
      const msg = formatEvent(route, event(ev, payload));
      expect(msg.title.length).toBeGreaterThan(0);
    });

    test(`github parse detects ${ev}`, () => {
      const headers = { "x-github-event": ev };
      const parsed = detectProvider(headers)?.parse(JSON.stringify(payload), headers);
      expect(parsed?.event).toBe(ev);
    });
  }

  test("formats gitea push with a title", () => {
    const msg = formatEvent(route, event("push", giteaPush));
    expect(msg.title.length).toBeGreaterThan(0);
  });

  test("gitea parse detects push", () => {
    const headers = { "x-gitea-event": "push" };
    const parsed = detectProvider(headers)?.parse(JSON.stringify(giteaPush), headers);
    expect(parsed?.event).toBe("push");
  });

  test("custom parse detects custom event", () => {
    const headers = { "x-webhooker-signature": "sha256=abc" };
    const parsed = detectProvider(headers)?.parse(JSON.stringify(customPayload), headers);
    expect(parsed?.event).toBe("custom");
  });
});
