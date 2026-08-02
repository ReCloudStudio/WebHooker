import { Octokit } from "octokit";
import { saveToken, getToken } from "./store";

export function getOAuthURL(clientId: string, state: string): string {
  return `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo&state=${state}`;
}

export async function handleOAuthCallback(
  clientId: string,
  clientSecret: string,
  code: string,
  _state: string,
  kv: KVNamespace,
): Promise<{ userId: string; login: string } | null> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    error?: string;
  };

  if (!data.access_token) return null;

  const octokit = new Octokit({ auth: data.access_token });
  const { data: user } = await octokit.rest.users.getAuthenticated();

  await saveToken(kv, user.id.toString(), data.access_token, 3600 * 10);

  return { userId: user.id.toString(), login: user.login };
}

export async function getUserOctokit(userId: string, kv: KVNamespace): Promise<Octokit | null> {
  const token = await getToken(kv, userId);
  if (!token) return null;
  return new Octokit({ auth: token });
}

/**
 * Map an Octokit REST error to a stable, translatable code the caller can
 * turn into a user-facing message.
 */
function mapGitHubError(err: unknown): Error {
  const status = (err as { status?: number })?.status;
  if (status === 401) return new Error("GITHUB_TOKEN_EXPIRED");
  if (status === 403) return new Error("GITHUB_FORBIDDEN");
  if (status === 404) return new Error("GITHUB_NOT_FOUND");
  return err instanceof Error ? err : new Error(String(err));
}

async function requireOctokit(kv: KVNamespace, githubUserId: string): Promise<Octokit> {
  const octokit = await getUserOctokit(githubUserId, kv);
  if (!octokit) throw new Error("GITHUB_TOKEN_EXPIRED");
  return octokit;
}

/**
 * Post an issue/PR comment AS the given GitHub user (their OAuth token),
 * so the comment shows up under their own identity instead of the bot.
 */
export async function commentAsUser(
  kv: KVNamespace,
  githubUserId: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ htmlUrl: string; login: string }> {
  const octokit = await requireOctokit(kv, githubUserId);
  try {
    const { data: me } = await octokit.rest.users.getAuthenticated();
    const res = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    return { htmlUrl: res.data.html_url, login: me.login };
  } catch (err) {
    throw mapGitHubError(err);
  }
}

/** Fetch a single issue comment's current body (used to prefill the edit modal). */
export async function getCommentAsUser(
  kv: KVNamespace,
  githubUserId: string,
  owner: string,
  repo: string,
  commentId: number,
): Promise<{ body: string; login: string }> {
  const octokit = await requireOctokit(kv, githubUserId);
  try {
    const res = await octokit.rest.issues.getComment({ owner, repo, comment_id: commentId });
    return { body: res.data.body ?? "", login: res.data.user?.login ?? "" };
  } catch (err) {
    throw mapGitHubError(err);
  }
}

/** Edit an existing issue/PR comment. GitHub enforces permission (403 if not allowed). */
export async function editCommentAsUser(
  kv: KVNamespace,
  githubUserId: string,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<{ htmlUrl: string }> {
  const octokit = await requireOctokit(kv, githubUserId);
  try {
    const res = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body,
    });
    return { htmlUrl: res.data.html_url };
  } catch (err) {
    throw mapGitHubError(err);
  }
}

/** Delete an existing issue/PR comment. GitHub enforces permission (403 if not allowed). */
export async function deleteCommentAsUser(
  kv: KVNamespace,
  githubUserId: string,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  const octokit = await requireOctokit(kv, githubUserId);
  try {
    await octokit.rest.issues.deleteComment({ owner, repo, comment_id: commentId });
  } catch (err) {
    throw mapGitHubError(err);
  }
}

/** Merge a pull request as the linked GitHub user. GitHub enforces permission (403 if not allowed). */
export async function mergePullRequestAsUser(
  kv: KVNamespace,
  githubUserId: string,
  owner: string,
  repo: string,
  pullNumber: number,
  method: "merge" | "squash" | "rebase" = "squash",
): Promise<void> {
  const octokit = await requireOctokit(kv, githubUserId);
  try {
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: method,
    });
  } catch (err) {
    throw mapGitHubError(err);
  }
}

/** Close a pull request as the linked GitHub user. GitHub enforces permission (403 if not allowed). */
export async function closePullRequestAsUser(
  kv: KVNamespace,
  githubUserId: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<void> {
  const octokit = await requireOctokit(kv, githubUserId);
  try {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      state: "closed",
    });
  } catch (err) {
    throw mapGitHubError(err);
  }
}
