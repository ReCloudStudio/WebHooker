export const githubPush: Record<string, unknown> = {
  ref: "refs/heads/main",
  before: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  after: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  compare: "https://github.com/acme/widget/compare/aaa...bbb",
  head_commit: {
    id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    message: "Fix login bug",
    timestamp: "2026-08-15T00:00:00Z",
    url: "https://github.com/acme/widget/commit/bbb",
    author: { name: "Octocat", username: "octocat" },
  },
  repository: {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
  },
  sender: { login: "octocat" },
  pusher: { name: "octocat" },
  commits: [
    {
      id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      message: "Fix login bug",
      url: "https://github.com/acme/widget/commit/bbb",
      timestamp: "2026-08-15T00:00:00Z",
      author: { name: "Octocat", username: "octocat" },
    },
  ],
};

export const githubPullRequest: Record<string, unknown> = {
  action: "opened",
  number: 7,
  pull_request: {
    number: 7,
    title: "Add feature",
    html_url: "https://github.com/acme/widget/pull/7",
    state: "open",
    user: { login: "octocat" },
    body: "Implements the new feature.",
    head: { ref: "feature" },
    base: { ref: "main" },
    merged: false,
  },
  repository: {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
  },
  sender: { login: "octocat" },
};

export const githubIssues: Record<string, unknown> = {
  action: "opened",
  issue: {
    number: 12,
    title: "Broken login on mobile",
    html_url: "https://github.com/acme/widget/issues/12",
    state: "open",
    user: { login: "octocat" },
    body: "Login fails on iOS Safari.",
  },
  repository: {
    full_name: "acme/widget",
    html_url: "https://github.com/acme/widget",
  },
  sender: { login: "octocat" },
};
