import { describe, it, expect } from "bun:test";
import { createHmac } from "crypto";
import { detectProvider } from "../providers";
import { verifyGiteaSignature } from "../providers/gitea/verify";
import { parseGiteaEvent } from "../providers/gitea/parse";
import { formatEvent } from "../formatters";
import type { Route } from "../types";

function giteaSign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("provider detection", () => {
  it("detects github by X-GitHub-Event header", () => {
    const p = detectProvider({ "x-github-event": "push" });
    expect(p?.id).toBe("github");
  });

  it("detects gitea by X-Gitea-Event header", () => {
    const p = detectProvider({ "x-gitea-event": "push" });
    expect(p?.id).toBe("gitea");
  });

  it("prefers gitea when both gitea and github headers are present", () => {
    // Gitea webhooks also send GitHub-compatible headers (X-GitHub-Event,
    // X-Hub-Signature-256, X-Gogs-*), so detection must not misclassify them.
    const p = detectProvider({
      "x-gitea-event": "push",
      "x-github-event": "push",
      "x-gitea-signature": "abc",
      "x-hub-signature-256": "sha256=abc",
    });
    expect(p?.id).toBe("gitea");
  });

  it("returns null for unknown providers", () => {
    expect(detectProvider({})).toBeNull();
    expect(detectProvider({ "x-gitlab-event": "Push Hook" })).toBeNull();
  });
});

describe("gitea signature", () => {
  const secret = "gitea-secret";

  it("accepts a valid hex HMAC-SHA256 signature (no sha256= prefix)", async () => {
    const body = '{"ref":"refs/heads/main"}';
    const sig = giteaSign(body, secret);
    expect(await verifyGiteaSignature(body, sig, secret)).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    expect(await verifyGiteaSignature("body", "deadbeef", secret)).toBe(false);
  });

  it("rejects when signature or secret is missing", async () => {
    expect(await verifyGiteaSignature("body", undefined, secret)).toBe(false);
    expect(await verifyGiteaSignature("body", "abc", undefined)).toBe(false);
  });
});

describe("gitea event parsing", () => {
  it("parses a push event and sets the provider", () => {
    const event = parseGiteaEvent(
      { "x-gitea-event": "push", "x-gitea-delivery": "d-1" },
      JSON.stringify({
        ref: "refs/heads/main",
        compare_url: "https://git.example.com/org/repo/compare/abc...def",
        pusher: { login: "octo", html_url: "https://git.example.com/octo" },
        repository: { full_name: "org/repo", html_url: "https://git.example.com/org/repo" },
      }),
    );
    expect(event).not.toBeNull();
    expect(event!.provider).toBe("gitea");
    expect(event!.event).toBe("push");
    expect(event!.deliveryId).toBe("d-1");
    expect(event!.payload.compare).toBe("https://git.example.com/org/repo/compare/abc...def");
    expect((event!.payload.sender as { login?: string }).login).toBe("octo");
  });

  it("maps pull_request_comment to pull_request_review_comment and pulls the PR", () => {
    const event = parseGiteaEvent(
      { "x-gitea-event": "pull_request_comment" },
      JSON.stringify({
        action: "created",
        issue: { number: 7, title: "Add feature", html_url: "https://git.example.com/org/repo/pulls/7" },
        comment: { body: "looks good", line: 12, html_url: "https://git.example.com/org/repo/pulls/7#issuecomment-1" },
        repository: { full_name: "org/repo" },
        sender: { login: "octo" },
      }),
    );
    expect(event!.event).toBe("pull_request_review_comment");
    const pr = event!.payload.pull_request as { number?: number; title?: string };
    expect(pr.number).toBe(7);
    const comment = event!.payload.comment as { position?: number };
    expect(comment.position).toBe(12);
  });

  it("copies top-level commit_id onto the comment for commit_comment events", () => {
    const event = parseGiteaEvent(
      { "x-gitea-event": "commit_comment" },
      JSON.stringify({
        action: "created",
        commit_id: "abcd1234ef",
        comment: { body: "why?", html_url: "https://git.example.com/org/repo/commit/abcd1234ef#commitcomment-1" },
        repository: { full_name: "org/repo" },
        sender: { login: "octo" },
      }),
    );
    expect(event!.event).toBe("commit_comment");
    expect((event!.payload.comment as { commit_id?: string }).commit_id).toBe("abcd1234ef");
  });

  it("returns null for missing event header or invalid JSON", () => {
    expect(parseGiteaEvent({}, "{}")).toBeNull();
    expect(parseGiteaEvent({ "x-gitea-event": "push" }, "not json")).toBeNull();
  });

  it("formats a normalized gitea push with gitea commit links", () => {
    const event = parseGiteaEvent(
      { "x-gitea-event": "push" },
      JSON.stringify({
        ref: "refs/heads/main",
        compare_url: "https://git.example.com/org/repo/compare/abc...def",
        pusher: { login: "octo", html_url: "https://git.example.com/octo" },
        commits: [{ id: "abcd1234ef", message: "fix stuff", added: [], removed: [], modified: [] }],
        repository: { full_name: "org/repo", html_url: "https://git.example.com/org/repo" },
      }),
    );
    const route: Route = {
      id: "test",
      name: "Test",
      enabled: true,
      filters: [],
      targets: [{ channelId: "111" }],
    };
    const msg = formatEvent(route, event!);
    expect(msg.title).toContain("org/repo");
    expect(msg.fields![0].value).toBe(
      "[`abcd123`](https://git.example.com/org/repo/commit/abcd1234ef) fix stuff",
    );
  });
});
