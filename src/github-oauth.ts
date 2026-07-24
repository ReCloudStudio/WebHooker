import { Octokit } from "octokit";
import { saveToken, getToken } from "./token-store";

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
