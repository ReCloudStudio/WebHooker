import { describe, it, expect } from "bun:test";
import { formatEvent } from "../server/lib/formatters";
import type { Route, WebhookEvent } from "../server/lib/types";

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
    expect(msg.title).toBe(
      "acme/widget: Pushed 1 commit to [`main`](https://github.com/acme/widget/tree/main)",
    );
    expect(msg.description).toBe(
      "[View comparison](https://github.com/acme/widget/compare/abc...def)",
    );
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
    expect(msg.title).toBe("acme/widget#7: Add feature");
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
    expect(msg.title).toBe("acme/widget#3: Bug report");
    expect(msg.title).not.toContain("Comment on");
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
    expect(msg.title).toBe(
      "acme/widget: [CI — success](https://github.com/acme/widget/actions/runs/42)",
    );
    expect(msg.fields![1].value).toBe("✅ build");
  });

  it("workflow_run distinguishes queued and running from pending", () => {
    const run = {
      name: "CI",
      conclusion: null as string | null,
      html_url: "https://github.com/acme/widget/actions/runs/42",
      head_branch: "main",
      run_number: 42,
    };
    const queued = formatEvent(
      route,
      event("workflow_run", {
        action: "requested",
        workflow_run: run,
        repository: repo,
        sender,
      }),
    );
    expect(queued.title).toBe(
      "acme/widget: [CI — queued](https://github.com/acme/widget/actions/runs/42)",
    );
    expect(queued.fields![0].value).toBe("⏳ queued");

    const running = formatEvent(
      route,
      event("workflow_run", {
        action: "in_progress",
        workflow_run: run,
        repository: repo,
        sender,
      }),
    );
    expect(running.title).toBe(
      "acme/widget: [CI — running](https://github.com/acme/widget/actions/runs/42)",
    );
    expect(running.fields![0].value).toBe("🔄 running");
  });

  it("check_run uses status for queued and running", () => {
    const checkRun = {
      id: 42,
      name: "Lint",
      html_url: "https://github.com/acme/widget/runs/1",
      conclusion: null as string | null,
      status: "in_progress",
    };
    const msg = formatEvent(
      route,
      event("check_run", { check_run: checkRun, repository: repo, sender }),
    );
    expect(msg.title).toBe("acme/widget: Lint — running");
    expect(msg.fields![0].value).toBe("🔄 running");
    expect(msg.updateKey).toBe("check_run:acme/widget:42");
  });

  it("check_run omits updateKey without a run id", () => {
    const msg = formatEvent(
      route,
      event("check_run", {
        check_run: { name: "Lint", status: "completed", conclusion: "success" },
        repository: repo,
        sender,
      }),
    );
    expect(msg.updateKey).toBeUndefined();
  });

  it("check_suite shows conclusion, service, branch and commit", () => {
    const suite = {
      html_url: "https://github.com/acme/widget/runs/2",
      conclusion: "success",
      status: "completed",
      app: { name: "Cloudflare Pages" },
      head_branch: "main",
      head_sha: "abc123def456",
    };
    const msg = formatEvent(
      route,
      event("check_suite", { check_suite: suite, repository: repo, sender }),
    );
    expect(msg.title).toBe("acme/widget: Check suite success");
    expect(msg.url).toBe("https://github.com/acme/widget/runs/2");
    expect(msg.fields![0].value).toBe("✅ success");
    expect(msg.fields![1].value).toBe("Cloudflare Pages");
    expect(msg.fields![2].value).toBe("[\`main\`](https://github.com/acme/widget/tree/main)");
    expect(msg.fields![3].value).toBe(
      "[\`abc123d\`](https://github.com/acme/widget/commit/abc123def456)",
    );
  });

  it("workflow_job shows job status, workflow, branch and commit", () => {
    const job = {
      html_url: "https://github.com/acme/widget/actions/runs/2/job/9",
      name: "test",
      status: "completed",
      conclusion: "failure",
      workflow_name: "CI",
      head_branch: "main",
      head_sha: "abc123def456",
    };
    const msg = formatEvent(
      route,
      event("workflow_job", { workflow_job: job, repository: repo, sender }),
    );
    expect(msg.title).toBe("acme/widget: Job test — failure");
    expect(msg.fields![0].value).toBe("❌ failure");
    expect(msg.fields![1].value).toBe("test");
    expect(msg.fields![2].value).toBe("CI");
    expect(msg.fields![3].value).toBe("[\`main\`](https://github.com/acme/widget/tree/main)");
    expect(msg.fields![4].value).toBe(
      "[\`abc123d\`](https://github.com/acme/widget/commit/abc123def456)",
    );
  });

  it("status shows context, state and commit", () => {
    const msg = formatEvent(
      route,
      event("status", {
        state: "pending",
        context: "continuous-integration/travis-ci",
        description: "The Travis CI build is in progress",
        target_url: "https://travis-ci.org/acme/widget/builds/1",
        sha: "abc123def456",
        repository: repo,
        sender,
      }),
    );
    expect(msg.title).toBe("acme/widget: continuous-integration/travis-ci — pending");
    expect(msg.fields![0].value).toBe("⏳ pending");
    expect(msg.fields![1].value).toBe("continuous-integration/travis-ci");
    expect(msg.fields![2].value).toBe(
      "[\`abc123d\`](https://github.com/acme/widget/commit/abc123def456)",
    );
    expect(msg.fields![3].value).toBe("The Travis CI build is in progress");
  });

  it("deployment shows environment, branch and commit", () => {
    const deployment = {
      environment: "production",
      ref: "refs/heads/main",
      sha: "abc123def456",
      description: "Deploy request from octocat",
      html_url: "https://github.com/acme/widget/deployments/1",
    };
    const msg = formatEvent(route, event("deployment", { deployment, repository: repo, sender }));
    expect(msg.title).toBe("acme/widget: Deployment to `production` — created");
    expect(msg.fields![0].value).toBe("🚀 created");
    expect(msg.fields![1].value).toBe("production");
    expect(msg.fields![2].value).toBe("[\`main\`](https://github.com/acme/widget/tree/main)");
    expect(msg.fields![3].value).toBe(
      "[\`abc123d\`](https://github.com/acme/widget/commit/abc123def456)",
    );
  });

  it("ping shows the webhook confirmation", () => {
    const msg = formatEvent(
      route,
      event("ping", { zen: "Keep it logically awesome.", hook_id: 1, repository: repo, sender }),
    );
    expect(msg.title).toBe("acme/widget: Webhook ping");
    expect(msg.fields![0].value).toBe("1");
  });

  it("unknown events fall back to repo: event: action", () => {
    const msg = formatEvent(
      route,
      event("custom_event", { action: "ran", repository: repo, sender }),
    );
    expect(msg.title).toBe("acme/widget: custom_event: ran");
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
    expect(msg.title).toBe("acme/widget: 📦 Repository Created");
    expect(msg.description).toContain("🔗");
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
    expect(msg.title).toBe("acme/widget: Repository Created");
    expect(msg.title).not.toContain("📦");
    expect(msg.description).not.toContain("🔗");
  });

  it("push with deleted:true renders as a branch deletion", () => {
    const msg = formatEvent(
      route,
      event("push", {
        ref: "refs/heads/dependabot/npm_and_yarn/multi-e1b34b8be3",
        before: "abcd1234ef",
        after: "0000000000000000000000000000000000000000",
        created: false,
        forced: false,
        deleted: true,
        commits: [],
        repository: repo,
        sender,
      }),
    );
    expect(msg.title).toBe(
      "acme/widget: 🌿 Deleted branch [`dependabot/npm_and_yarn/multi-e1b34b8be3`](https://github.com/acme/widget/tree/dependabot/npm_and_yarn/multi-e1b34b8be3)",
    );
    expect(msg.description).toBeUndefined();
    expect(msg.fields).toBeUndefined();
  });

  it("push commit renders linked short hash with plain-text message", () => {
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
    expect(msg.fields![0].name).toBe("\u200b");
    expect(msg.fields![0].value).toBe(
      "[`abcd123`](https://github.com/acme/widget/commit/abcd1234ef) fix stuff",
    );
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
    expect(msg.description).not.toContain("⚠️");
    expect(msg.description).not.toContain("🆕");
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
    expect(msg.fields![0].value).toBe("failure");
    expect(msg.fields![1].value).toBe("build");
  });
});
