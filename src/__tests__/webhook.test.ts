import { describe, it, expect } from "bun:test";
import { createHmac } from "crypto";
import { verifySignature, parseEvent, matchRoute } from "../webhook";
import type { Route, WebhookEvent } from "../types";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifySignature", () => {
  const secret = "test-secret";

  it("returns true for valid signature", async () => {
    const body = '{"hello":"world"}';
    expect(await verifySignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("returns false for invalid signature", async () => {
    expect(await verifySignature("body", "sha256=invalid", secret)).toBe(false);
  });

  it("returns false for missing signature", async () => {
    expect(await verifySignature("body", undefined, secret)).toBe(false);
  });
});

describe("parseEvent", () => {
  it("parses valid push event", () => {
    const headers = { "x-github-event": "push", "x-hub-signature-256": "sha256=abc" };
    const body = JSON.stringify({ ref: "refs/heads/main", commits: [] });
    const event = parseEvent(headers, body);
    expect(event).not.toBeNull();
    expect(event!.event).toBe("push");
    expect(event!.payload.ref).toBe("refs/heads/main");
  });

  it("returns null for missing event header", () => {
    expect(parseEvent({}, "{}")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseEvent({ "x-github-event": "push" }, "not json")).toBeNull();
  });
});

describe("matchRoute", () => {
  const baseRoute: Route = {
    id: "test",
    name: "Test",
    enabled: true,
    filters: [],
    target: { channelId: "123" },
  };

  it("matches all events when no filters", () => {
    const event: WebhookEvent = { event: "push", payload: {} };
    expect(matchRoute(baseRoute, event)).toBe(true);
  });

  it("rejects disabled routes", () => {
    const route = { ...baseRoute, enabled: false };
    const event: WebhookEvent = { event: "push", payload: {} };
    expect(matchRoute(route, event)).toBe(false);
  });

  it("matches event filter", () => {
    const route = { ...baseRoute, filters: [{ type: "event" as const, match: "push" }] };
    expect(matchRoute(route, { event: "push", payload: {} })).toBe(true);
    expect(matchRoute(route, { event: "issues", payload: {} })).toBe(false);
  });

  it("matches event exclude filter", () => {
    const route = {
      ...baseRoute,
      filters: [{ type: "event" as const, match: "push", exclude: true }],
    };
    expect(matchRoute(route, { event: "push", payload: {} })).toBe(false);
    expect(matchRoute(route, { event: "issues", payload: {} })).toBe(true);
  });

  it("matches repo filter", () => {
    const route = { ...baseRoute, filters: [{ type: "repo" as const, match: "owner/repo" }] };
    const event: WebhookEvent = {
      event: "push",
      payload: { repository: { full_name: "owner/repo" } },
    };
    expect(matchRoute(route, event)).toBe(true);
  });

  it("matches actor filter", () => {
    const route = { ...baseRoute, filters: [{ type: "actor" as const, match: "octocat" }] };
    const event: WebhookEvent = { event: "push", payload: { sender: { login: "octocat" } } };
    expect(matchRoute(route, event)).toBe(true);
  });

  it("matches action filter", () => {
    const route = { ...baseRoute, filters: [{ type: "action" as const, match: "opened" }] };
    const event: WebhookEvent = { event: "issues", payload: { action: "opened" } };
    expect(matchRoute(route, event)).toBe(true);
  });

  it("matches branch filter for push events", () => {
    const route = { ...baseRoute, filters: [{ type: "branch" as const, match: "main" }] };
    const event: WebhookEvent = { event: "push", payload: { ref: "refs/heads/main" } };
    expect(matchRoute(route, event)).toBe(true);
    expect(matchRoute(route, { event: "push", payload: { ref: "refs/heads/dev" } })).toBe(false);
  });

  it("matches branch filter for pull_request events", () => {
    const route = { ...baseRoute, filters: [{ type: "branch" as const, match: "feature-x" }] };
    const event: WebhookEvent = {
      event: "pull_request",
      payload: { pull_request: { head: { ref: "feature-x" } } },
    };
    expect(matchRoute(route, event)).toBe(true);
    expect(
      matchRoute(route, {
        event: "pull_request",
        payload: { pull_request: { head: { ref: "other" } } },
      }),
    ).toBe(false);
  });

  it("matches keyword filter with regex", () => {
    const route = {
      ...baseRoute,
      filters: [{ type: "keyword" as const, match: "fix(es|ed)\\s+bug" }],
    };
    const event: WebhookEvent = {
      event: "push",
      payload: { commits: [{ message: "fixes bug #123" }] },
    };
    expect(matchRoute(route, event)).toBe(true);
    expect(
      matchRoute(route, { event: "push", payload: { commits: [{ message: "adds feature" }] } }),
    ).toBe(false);
  });

  it("matches keyword filter with plain text fallback", () => {
    const route = { ...baseRoute, filters: [{ type: "keyword" as const, match: "deploy" }] };
    const event: WebhookEvent = {
      event: "push",
      payload: { commits: [{ message: "deploy to prod" }] },
    };
    expect(matchRoute(route, event)).toBe(true);
  });

  it("matches multiple filters (AND logic)", () => {
    const route = {
      ...baseRoute,
      filters: [
        { type: "event" as const, match: "push" },
        { type: "actor" as const, match: "octocat" },
      ],
    };
    const event: WebhookEvent = { event: "push", payload: { sender: { login: "octocat" } } };
    expect(matchRoute(route, event)).toBe(true);
    expect(matchRoute(route, { event: "push", payload: { sender: { login: "other" } } })).toBe(
      false,
    );
  });

  it("matches array of patterns", () => {
    const route = {
      ...baseRoute,
      filters: [{ type: "event" as const, match: ["push", "pull_request"] }],
    };
    expect(matchRoute(route, { event: "push", payload: {} })).toBe(true);
    expect(matchRoute(route, { event: "pull_request", payload: {} })).toBe(true);
    expect(matchRoute(route, { event: "issues", payload: {} })).toBe(false);
  });
});
