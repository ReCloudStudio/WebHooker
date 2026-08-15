import { describe, test, expect } from "bun:test";
import { formatEvent } from "../server/lib/formatters";
import type { NeutralMessage, Route, WebhookEvent } from "../server/lib/types";
import { githubPush, githubPullRequest, githubIssues } from "./fixtures";

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

function stable(msg: NeutralMessage): NeutralMessage {
  return { ...msg, timestamp: msg.timestamp ? "TIMESTAMP" : msg.timestamp };
}

describe("formatter snapshots", () => {
  test("push", () => {
    expect(stable(formatEvent(route, event("push", githubPush)))).toMatchSnapshot();
  });

  test("pull_request", () => {
    expect(stable(formatEvent(route, event("pull_request", githubPullRequest)))).toMatchSnapshot();
  });

  test("issues", () => {
    expect(stable(formatEvent(route, event("issues", githubIssues)))).toMatchSnapshot();
  });
});
