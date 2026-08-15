export const giteaPush: Record<string, unknown> = {
  ref: "refs/heads/main",
  before: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  after: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  compare_url: "https://git.example.com/acme/widget/compare/aaa...bbb",
  commits: [
    {
      id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      message: "Fix login bug",
      url: "https://git.example.com/acme/widget/commit/bbb",
      timestamp: "2026-08-15T00:00:00Z",
      author: { name: "Octocat", username: "octocat" },
    },
  ],
  repository: {
    full_name: "acme/widget",
    html_url: "https://git.example.com/acme/widget",
  },
  pusher: { login: "octocat" },
};
