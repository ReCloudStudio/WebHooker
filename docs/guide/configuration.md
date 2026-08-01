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

### Optional Secrets

| Variable                  | Description                                                                                           | Default                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `BASE_URL`                | Public URL for OAuth callbacks                                                                        | `http://localhost:8787` |
| `ADMIN_USER_IDS`          | Comma-separated GitHub user IDs (or logins) allowed to access the Web UI                              | Disabled                |
| `DISCORD_GATEWAY_ENABLED` | Set to `true` to connect the Discord Gateway (bot online status); messaging works without it via REST | `false`                 |

## Web UI

WebHooker ships with a built-in config console at `/admin` for managing routes in the browser. It is protected by GitHub OAuth plus an admin whitelist.

### Setup

1. Configure `ADMIN_USER_IDS` with the GitHub user IDs allowed to manage routes. Logins are also accepted, e.g. `ADMIN_USER_IDS=12345,RhenCloud`. If unset, the console is disabled.
2. Open `/admin` and sign in with GitHub.
3. Only users in the whitelist receive a session cookie; everyone else gets `403`.

### Endpoints

| Endpoint                | Description                 |
| ----------------------- | --------------------------- |
| `GET /admin`            | Config console UI           |
| `GET /admin/login`      | Start GitHub OAuth sign-in  |
| `GET /admin/logout`     | Destroy session             |
| `GET /admin/api/routes` | List routes (admin only)    |
| `PUT /admin/api/routes` | Replace routes (admin only) |

The console lets you add, edit, delete, and toggle routes. Saved routes are written to KV `config:routes` immediately and the config cache is invalidated so the webhook pipeline picks them up on the next run.

## Routes

Routes define which events get forwarded to which Discord channels. They are stored in Cloudflare KV under the key `config:routes` as a JSON array.

There are **no default routes** — each route must define its own target. If no routes are configured, no events are forwarded.

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
    "channelId": "REQUIRED_CHANNEL_ID",
    "threadId": "OPTIONAL_THREAD_ID"
  }
}
```

`target.channelId` is required and used as-is; there is no fallback to a default channel.

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

| Key Pattern      | Value                             | TTL          |
| ---------------- | --------------------------------- | ------------ |
| `config:routes`  | JSON array of routes              | Permanent    |
| `session:{id}`   | Admin session `{ userId, login }` | 7 days       |
| `token:{userId}` | `{ accessToken, expiresAt }`      | Until expiry |
| `state:{hex}`    | `{ userId, createdAt }`           | 600 seconds  |
