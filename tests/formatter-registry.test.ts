import { describe, it, expect } from "bun:test";
import { findFormatter } from "../server/lib/formatters/registry";
import { formatEvent } from "../server/lib/formatters";
import type { Route, WebhookEvent } from "../server/lib/types";

const SUPPORTED_EVENTS = [
  "push",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issues",
  "issue_comment",
  "workflow_run",
  "workflow_job",
  "status",
  "deployment",
  "ping",
  "release",
  "create",
  "delete",
  "star",
  "fork",
  "check_run",
  "check_suite",
  "commit_comment",
  "deployment_status",
  "member",
  "label",
  "milestone",
  "discussion",
  "discussion_comment",
  "repository",
  "code_scanning_alert",
  "dependabot_alert",
  "custom",
];

function makeRoute(): Route {
  return {
    id: "r1",
    name: "test",
    enabled: true,
    filters: [],
    targets: [{ platform: "discord", channelId: "c1" }],
  };
}

describe("findFormatter", () => {
  it("maps every supported event type to a formatter", () => {
    for (const event of SUPPORTED_EVENTS) {
      const formatter = findFormatter(event);
      expect(formatter, `missing formatter for ${event}`).toBeDefined();
      expect(formatter!.events).toContain(event);
    }
  });

  it("returns undefined for an unknown event type", () => {
    expect(findFormatter("totally_unknown_event")).toBeUndefined();
  });
});

describe("formatEvent", () => {
  it("falls back to the generic formatter for an unknown event", () => {
    const route = makeRoute();
    const event: WebhookEvent = {
      event: "totally_unknown_event",
      payload: { action: "opened" },
    };
    const message = formatEvent(route, event);
    expect(message).toBeDefined();
    expect(typeof message.title).toBe("string");
    expect(message.color).toBe(9147550);
  });

  it("routes a known event through its dedicated formatter", () => {
    const route = makeRoute();
    const event: WebhookEvent = {
      event: "issues",
      payload: {
        action: "opened",
        repository: { full_name: "acme/widget" },
        issue: { number: 7, title: "Add feature" },
        sender: { login: "alice" },
      },
    };
    const message = formatEvent(route, event);
    expect(message.title).toContain("acme/widget#7");
  });
});
