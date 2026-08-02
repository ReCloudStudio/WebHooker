import { describe, it, expect } from "bun:test";
import { formatEvent } from "../formatter";
import type { Route, WebhookEvent } from "../types";

const route: Route = {
  id: "test",
  name: "Test",
  enabled: true,
  filters: [],
  target: { channelId: "111" },
};

function event(ev: string, payload: Record<string, unknown>): WebhookEvent {
  return { event: ev, payload };
}

const repo = { full_name: "acme/widget", html_url: "https://github.com/acme/widget" };
const sender = { login: "octocat" };

describe("message title spec", () => {
  it("push title starts with the repo", () => {
    const msg = formatEvent(
      route,
      event("push", {
        ref: "refs/heads/main",
        compare: "https://github.com/acme/widget/compare/abc...def",
        created: false,
        forced: false,
        commits: [{ id: "abcd1234ef", message: "fix stuff", added: [], removed: [], modified: [] }],
        repository: repo,
        sender,
      }),
    );
    expect(msg.embeds![0].title).toBe("acme/widget: Pushed 1 commit");
  });

  it("pull_request title is repo#number: title", () => {
    const msg = formatEvent(
      route,
      event("pull_request", {
        action: "opened",
        number: 7,
        pull_request: {
          title: "Add feature",
          number: 7,
          state: "open",
          merged: false,
          draft: false,
          html_url: "https://github.com/acme/widget/pull/7",
          body: null,
          user: sender,
          head: { ref: "feat", repo: { full_name: "acme/widget" } },
          base: { ref: "main" },
        },
        repository: repo,
        sender,
      }),
    );
    expect(msg.embeds![0].title).toBe("acme/widget#7: Add feature");
  });

  it("issue_comment title has no 'Comment on' prefix", () => {
    const msg = formatEvent(
      route,
      event("issue_comment", {
        action: "created",
        issue: {
          number: 3,
          title: "Bug report",
          html_url: "https://github.com/acme/widget/issues/3",
        },
        comment: {
          body: "thanks",
          html_url: "https://github.com/acme/widget/issues/3#issuecomment-1",
        },
        repository: repo,
        sender,
      }),
    );
    expect(msg.embeds![0].title).toBe("acme/widget#3: Bug report");
    expect(msg.embeds![0].title).not.toContain("Comment on");
  });

  it("workflow_run title is repo: name — conclusion", () => {
    const msg = formatEvent(
      route,
      event("workflow_run", {
        action: "completed",
        workflow_run: {
          name: "CI",
          conclusion: "success",
          html_url: "https://github.com/acme/widget/actions/runs/42",
          head_branch: "main",
          run_number: 42,
          jobs: [{ name: "build", conclusion: "success" }],
        },
        repository: repo,
        sender,
      }),
    );
    expect(msg.embeds![0].title).toBe("acme/widget: CI — success");
    expect(msg.embeds![0].fields![1].value).toBe("✅ build");
  });

  it("unknown events fall back to repo: event: action", () => {
    const msg = formatEvent(
      route,
      event("custom_event", { action: "ran", repository: repo, sender }),
    );
    expect(msg.embeds![0].title).toBe("acme/widget: custom_event: ran");
  });
});

describe("group emoji toggle", () => {
  it("includes emoji by default", () => {
    const msg = formatEvent(
      route,
      event("repository", {
        action: "created",
        repository: { ...repo, visibility: "public", description: "a widget", fork: false },
        sender,
      }),
    );
    expect(msg.embeds![0].title).toBe("acme/widget: 📦 Repository Created");
    expect(msg.embeds![0].description).toContain("🔗");
  });

  it("strips emoji when showEmoji is false", () => {
    const msg = formatEvent(
      route,
      event("repository", {
        action: "created",
        repository: { ...repo, visibility: "public", description: "a widget", fork: false },
        sender,
      }),
      undefined,
      false,
    );
    expect(msg.embeds![0].title).toBe("acme/widget: Repository Created");
    expect(msg.embeds![0].title).not.toContain("📦");
    expect(msg.embeds![0].description).not.toContain("🔗");
  });

  it("strips emoji from push description when disabled", () => {
    const msg = formatEvent(
      route,
      event("push", {
        ref: "refs/heads/main",
        compare: "https://github.com/acme/widget/compare/abc...def",
        created: true,
        forced: true,
        commits: [{ id: "abcd1234ef", message: "fix stuff", added: [], removed: [], modified: [] }],
        repository: repo,
        sender,
      }),
      undefined,
      false,
    );
    expect(msg.embeds![0].description).not.toContain("⚠️");
    expect(msg.embeds![0].description).not.toContain("🆕");
  });

  it("strips emoji from workflow_run status when disabled", () => {
    const msg = formatEvent(
      route,
      event("workflow_run", {
        action: "completed",
        workflow_run: {
          name: "CI",
          conclusion: "failure",
          html_url: "https://github.com/acme/widget/actions/runs/42",
          head_branch: "main",
          run_number: 42,
          jobs: [{ name: "build", conclusion: "failure" }],
        },
        repository: repo,
        sender,
      }),
      undefined,
      false,
    );
    expect(msg.embeds![0].fields![0].value).toBe("failure");
    expect(msg.embeds![0].fields![1].value).toBe("build");
  });
});
