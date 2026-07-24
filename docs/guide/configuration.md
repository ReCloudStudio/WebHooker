# Configuration

## Secrets

WebHooker requires several secrets to function. For local development, store them in `.dev.vars`. For production, use Cloudflare Worker Secrets.

### Required Secrets

| Variable                | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret from your GitHub App settings    |
| `GITHUB_APP_ID`         | Numeric ID of your GitHub App                   |
| `GITHUB_PRIVATE_KEY`    | App private key (PEM format, with `\n` escapes) |
| `GITHUB_CLIENT_ID`      | OAuth client ID from App settings               |
| `GITHUB_CLIENT_SECRET`  | OAuth client secret from App settings           |
| `DISCORD_TOKEN`         | Discord bot token                               |
| `DISCORD_CHANNEL_ID`    | Default Discord channel ID for messages         |

### Optional Secrets

| Variable   | Description                    | Default                 |
| ---------- | ------------------------------ | ----------------------- |
| `BASE_URL` | Public URL for OAuth callbacks | `http://localhost:8787` |

## Routes

Routes define which events get forwarded to which Discord channels. They are stored in Cloudflare KV under the key `config:routes` as a JSON array.

On first boot, 7 default routes are used if no KV config exists.

### Route Schema

```json
{
  "id": "unique-route-id",
  "name": "Human-readable name",
  "enabled": true,
  "filters": [
    { "type": "event", "match": "push" },
    { "type": "repo", "match": "org/repo", "exclude": false }
  ],
  "target": {
    "channelId": "DISCORD_CHANNEL_ID",
    "threadId": "OPTIONAL_THREAD_ID"
  }
}
```

### Default Routes

| ID                | Event(s)           | Description                      |
| ----------------- | ------------------ | -------------------------------- |
| `all-push`        | `push`             | All push events                  |
| `pull-requests`   | `pull_request`     | All PR activity                  |
| `issues`          | `issues`           | Issue open/close/edit            |
| `issue-comments`  | `issue_comment`    | Issue and PR comments            |
| `workflow-runs`   | `workflow_run`     | CI/CD workflow completions       |
| `releases`        | `release`          | Release publish/edit             |
| `branch-activity` | `create`, `delete` | Branch/tag creation and deletion |

### Custom Route Example

```json
[
  {
    "id": "backend-prs",
    "name": "Backend PRs",
    "enabled": true,
    "filters": [
      { "type": "repo", "match": "myorg/backend" },
      { "type": "event", "match": "pull_request" },
      { "type": "actor", "match": "[bot]", "exclude": true }
    ],
    "target": {
      "channelId": "1234567890",
      "threadId": "9876543210"
    }
  }
]
```

## Filter Types

| Type      | Matches              | Example                          |
| --------- | -------------------- | -------------------------------- |
| `event`   | GitHub event name    | `push`, `pull_request`, `issues` |
| `repo`    | Repository full name | `org/repo`                       |
| `actor`   | Sender login         | `username`, `[bot]`              |
| `action`  | Event action         | `opened`, `closed`, `published`  |
| `branch`  | Branch name          | `main`, `feature/*`              |
| `keyword` | Text in payload body | `deploy`, `/fix\s+\d+/` (regex)  |

### Filter Behavior

- All filters in a route must match for the route to trigger (AND logic)
- Set `"exclude": true` on any filter to invert it (NOT logic)
- `keyword` filter supports regex patterns — falls back to substring match if regex is invalid
- `branch` filter works for push, pull_request, create/delete, workflow_run, and code_scanning_alert events

### Match Values

Filters accept either a single string or an array of strings:

```json
{ "type": "event", "match": "push" }
{ "type": "event", "match": ["push", "pull_request"] }
```

## KV Storage Layout

| Key Pattern      | Value                        | TTL          |
| ---------------- | ---------------------------- | ------------ |
| `config:routes`  | JSON array of routes         | Permanent    |
| `token:{userId}` | `{ accessToken, expiresAt }` | Until expiry |
| `state:{hex}`    | `{ userId, createdAt }`      | 600 seconds  |
