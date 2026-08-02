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
| `DISCORD_PUBLIC_KEY`    | Discord application public key (Developer Portal) — required for interactions | Unset → interactions return `401` |
| `DISCORD_APPLICATION_ID` | Discord application id; auto-resolved when omitted | Auto-resolved          |
| `BASE_URL`                | Public URL for OAuth callbacks                                                                        | `http://localhost:8787` |
| `ADMIN_USER_IDS`          | Comma-separated GitHub user IDs (or logins) allowed to access the Web UI                              | Disabled                |

## Web UI

WebHooker ships with a built-in config console at `/admin` for managing routes in the browser. It is protected by GitHub OAuth plus an admin whitelist.

### Setup

1. Configure `ADMIN_USER_IDS` with the GitHub user IDs allowed to manage routes. Logins are also accepted, e.g. `ADMIN_USER_IDS=12345,RhenCloud`. If unset, the console is disabled.
2. Open `/admin` and sign in with GitHub.
3. Only users in the whitelist receive a session cookie; everyone else gets `403`.

### Endpoints

| Endpoint                           | Description                             |
| ---------------------------------- | --------------------------------------- |
| `GET /admin`                       | Config console UI                       |
| `GET /admin/login`                 | Start GitHub OAuth sign-in              |
| `GET /admin/logout`                | Destroy session                         |
| `GET /admin/api/me`                | Current session, scope, and groups      |
| `GET /admin/api/routes`            | List routes (admin only)                |
| `PUT /admin/api/routes`            | Replace routes (admin only)             |
| `GET /admin/api/groups`            | List groups (scoped to access)          |
| `PUT /admin/api/groups`            | Replace groups (super admin only)       |
| `GET /admin/api/groups/:id/routes` | List a group's routes                   |
| `PUT /admin/api/groups/:id/routes` | Replace a group's routes                |
| `GET /admin/api/logs`              | Send logs (scoped to accessible routes) |

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
  "groupId": "my-group",
  "fallback": false,
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

Other route fields:

| Field      | Type    | Required | Description                                                                                     |
| ---------- | ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `groupId`  | string  | Yes      | Id of the [group](#groups) this route belongs to                                                |
| `fallback` | boolean | No       | When `true`, fires only if no non-fallback route matched the event; its own filters are ignored |
| `lang`     | string  | No       | Message language override for this route (e.g. `en`, `zh`); defaults to the global setting      |

### Custom Route Example

```json
[
  {
    "id": "backend-prs",
    "name": "Backend PRs",
    "enabled": true,
    "groupId": "backend-team",
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

## Groups

Routes belong to groups. Groups scope admin access and can restrict which events flow into them. They are stored in Cloudflare KV under the key `config:groups` as a JSON array.

### Group Schema

```json
{
  "id": "backend-team",
  "name": "Backend Team",
  "adminIds": ["rhencloud"],
  "owners": ["myorg"]
}
```

| Field      | Type     | Required | Description                                                            |
| ---------- | -------- | -------- | ---------------------------------------------------------------------- |
| `id`       | string   | Yes      | Lowercase id (`a-z0-9`, `-`); referenced by each route's `groupId`     |
| `name`     | string   | Yes      | Human-readable group name                                              |
| `adminIds` | string[] | Yes      | GitHub user IDs or logins who may manage this group's routes           |
| `owners`   | string[] | No       | Org/user logins whose events are accepted into this group; empty = all |

### Access Model

- **Super admins** (`ADMIN_USER_IDS`) see and edit every group and all routes.
- **Group admins** (`adminIds`) only see and edit the groups they manage; submitting a route outside their groups returns `403`.
- Group admin endpoints operate on a single group at a time via `/admin/api/groups/:id/routes`; `groupId` is forced from the path parameter.
- The `owners` list restricts which event actors (sender logins) the group's routes will dispatch at all.

## Filter Types

See the [Filter Tutorial](./filters) for a hands-on guide with worked examples.

| Type      | Matches              | Example                          |
| --------- | -------------------- | -------------------------------- |
| `event`   | GitHub event name    | `push`, `pull_request`, `issues` |
| `repo`    | Repository full name | `org/repo`                       |
| `actor`   | Sender login         | `username`, `[bot]`              |
| `action`  | Event action         | `opened`, `closed`, `published`  |
| `branch`  | Branch name          | `main`, `develop`                |
| `keyword` | Text in payload body | `deploy`, `/fix\s+\d+/` (regex)  |

### Filter Behavior

- All filters in a route must match for the route to trigger (AND logic)
- Set `"exclude": true` on any filter to invert it (NOT logic)
- Non-keyword filters are **exact, case-insensitive matches** — no wildcards (`repo: "org/*"` does not match anything)
- `keyword` filter supports regex patterns — falls back to substring match if regex is invalid or longer than 200 characters
- `branch` filter works for push, pull_request, pull_request_review, pull_request_review_comment, create/delete, workflow_run, and code_scanning_alert events

### Match Values

Filters accept either a single string or an array of strings:

```json
{ "type": "event", "match": "push" }
{ "type": "event", "match": ["push", "pull_request"] }
```

## KV Storage Layout

| Key Pattern              | Value                                               | TTL                |
| ------------------------ | --------------------------------------------------- | ------------------ |
| `config:routes`          | JSON array of routes                                | Permanent          |
| `config:groups`          | JSON array of groups                                | Permanent          |
| `session:{id}`           | Admin session `{ userId, login }`                   | 7 days             |
| `token:{userId}`         | `{ userId, accessToken, expiresAt, refreshToken? }` | 0.9 × token expiry |
| `token-reverse:{sha256}` | User id for reverse lookup by token                 | 0.9 × token expiry |
| `discord-link:{userId}`  | GitHub user id linked to a Discord user             | Permanent          |
| `state:{hex}`            | `{ redirectTo, expiresAt, discordUserId? }`         | 600 seconds        |
| `delivery:{id}`          | Webhook delivery id (dedup marker)                  | 300 seconds        |
| `cmd:guild:{id}`         | Guild id whose commands were registered (dedup)     | Permanent          |
| `cmd:registered:global`  | Global command registration marker (dedup)          | 1 day              |
| `config:discord-app-id`  | Cached Discord application id                       | Permanent          |
| `logs:send:{ts}-{hex}`   | Send record                                         | 1 hour             |
