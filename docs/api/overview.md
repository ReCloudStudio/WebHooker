# API Overview

WebHooker exposes an HTTP API via Nitro on Cloudflare Workers.

## Base URL

```
https://your-worker.workers.dev
```

## Endpoints

| Method   | Path                                       | Auth              | Description                                                        |
|----------|--------------------------------------------|-------------------|--------------------------------------------------------------------|
| `GET`    | `/health`                                  | None              | Health check                                                       |
| `POST`   | `/webhook`                                 | HMAC signature    | GitHub / Gitea / custom webhook ingestion (provider auto-detected) |
| `POST`   | `/webhook/:groupId`                        | Per-group secret  | Per-group webhook ingress (only that group's routes fire)          |
| `POST`   | `/discord/interactions`                    | Ed25519 signature | Discord interactions (slash commands, buttons, modals)             |
| `POST`   | `/telegram/webhook`                        | Secret token      | Telegram updates (bot `/gh` commands)                              |
| `GET`    | `/api/richheader`                          | None              | Open Graph page for the Telegram avatar link-preview card          |
| `GET`    | `/auth/github`                             | None              | Start GitHub OAuth flow                                            |
| `GET`    | `/auth/github/callback`                    | None              | OAuth callback                                                     |
| `GET`    | `/auth/github/install`                     | Admin session     | Post-install choice page: bind the installation to a group         |
| `POST`   | `/auth/github/install/bind`                | Admin session     | Provision the chosen installation binding                          |
| `DELETE` | `/auth/token/:userId`                      | Admin session     | Revoke user token                                                  |
| `POST`   | `/api/comment`                             | Bearer token      | Create issue comment                                               |
| `POST`   | `/api/merge`                               | Bearer token      | Merge pull request                                                 |
| `POST`   | `/api/close`                               | Bearer token      | Close pull request                                                 |
| `POST`   | `/api/react`                               | Bearer token      | Add reaction to issue                                              |
| `GET`    | `/admin`                                   | Admin session     | Config console UI                                                  |
| `GET`    | `/admin/login`                             | None              | Start admin sign-in (GitHub OAuth)                                 |
| `GET`    | `/admin/logout`                            | Admin session     | Sign out and destroy the session                                   |
| `GET`    | `/admin/invite`                            | Admin session     | Accept a group invite (browser page, `?token=…`)                   |
| `GET`    | `/admin/api/me`                            | Admin session     | Current session, scope, groups, and roles                          |
| `GET`    | `/admin/api/routes`                        | Admin session     | List routes (scoped to access)                                     |
| `PUT`    | `/admin/api/routes`                        | Admin session     | Replace routes (owner/admin per group)                             |
| `GET`    | `/admin/api/groups`                        | Admin session     | List groups + the signed-in user's role in each                    |
| `PUT`    | `/admin/api/groups`                        | Admin session     | Replace groups (super: all; owner: own only)                       |
| `GET`    | `/admin/api/groups/:id/routes`             | Admin session     | List a group's routes                                              |
| `PUT`    | `/admin/api/groups/:id/routes`             | Admin session     | Replace a group's routes (owner/admin)                             |
| `PUT`    | `/admin/api/groups/:id/rename`             | Admin session     | Rename a group (owner); routes/secret/invites follow               |
| `GET`    | `/admin/api/groups/:id/invites`            | Admin session     | List pending invites (owner)                                       |
| `POST`   | `/admin/api/groups/:id/invites`            | Admin session     | Create an invite link (owner)                                      |
| `DELETE` | `/admin/api/invites/:token`                | Admin session     | Revoke an invite (owner)                                           |
| `GET`    | `/admin/api/groups/:id/webhook`            | Admin session     | Group webhook endpoint info (owner)                                |
| `POST`   | `/admin/api/groups/:id/webhook/regenerate` | Admin session     | Generate/regenerate the group webhook secret (owner)               |
| `DELETE` | `/admin/api/groups/:id/webhook`            | Admin session     | Disable the group webhook ingress (owner)                          |
| `GET`    | `/admin/api/logs`                          | Admin session     | Send logs (scoped)                                                 |
| `GET`    | `/admin/api/logs/:id`                      | Admin session     | Single send-log entry (scoped)                                     |
| `GET`    | `/admin/api/audit`                         | Admin session     | Audit log (scoped to accessible groups)                            |

## Admin Console

See [Configuration → Web UI](../guide/configuration.md#web-ui) for setup. Admin endpoints require a session cookie obtained via `GET /admin/login` (GitHub OAuth); the signed-in user must be listed in `ADMIN_USER_IDS` or manage a group.

- `GET /admin` — Serves the config console HTML
- `GET /admin/api/routes` — Returns `{ "routes": Route[] }`
- `PUT /admin/api/routes` — Body `{ "routes": Route[] }`; validates each route (id pattern, unique id, name, enabled, `groupId`, filters — empty only allowed for `fallback` routes — optional `discordRoleIds` (list of role id strings), and platform-aware targets: `target.channelId` for Discord, `target.chatId` for Telegram) and persists to KV `config:routes`. Returns `200 { ok, count }` or `400 { error }` / `401 { error }` / `403 { error }`.

## Health Check

```
GET /health
```

**Response:**

```json
{
  "status": "ok"
}
```

## Webhook Ingestion

```
POST /webhook
```

Accepts GitHub webhook payloads. Requires valid `X-Hub-Signature-256` header.

**Headers:**

| Header                | Required | Description                                      |
|-----------------------|----------|--------------------------------------------------|
| `X-Hub-Signature-256` | Yes      | HMAC-SHA256 signature                            |
| `X-GitHub-Event`      | Yes      | Event type name                                  |
| `X-GitHub-Delivery`   | No       | Unique delivery ID (used for dedup when present) |

**Request Body:** GitHub webhook JSON payload (max 1MB).

**Response:**

```json
{
  "ok": true
}
```

When `X-GitHub-Delivery` is present and the same delivery was already processed within the last 5 minutes, the worker responds `200 { "ok": true, "duplicate": true }` without re-dispatching.

**Error Responses:**

| Status | Body                             | Cause                                  |
|--------|----------------------------------|----------------------------------------|
| `401`  | `{"error": "Invalid signature"}` | Signature verification failed          |
| `400`  | `{"error": "Invalid event"}`     | Missing event header or malformed body |
| `413`  | `{"error": "Request too large"}` | Body exceeds 1MB limit                 |

### Per-Group Webhook (`POST /webhook/:groupId`)

Verifies the payload against the **group's** secret (KV `tenant:{groupId}`, generated from the console — Webhook endpoint panel) instead of the global secrets, and dispatches only into that group's routes. Works for GitHub (`X-Hub-Signature-256`), Gitea (`X-Gitea-Signature`) and custom (`X-WebHooker-Signature`) senders. Returns `404` when the group does not exist or has no secret configured.

### Custom Webhooks

Any JSON payload signed with `X-WebHooker-Signature: sha256=<hex>` (HMAC-SHA256 of the raw body, group or global secret) becomes a `custom` event. Route it with a route whose filter is `event: custom`. Payload schema: see [Configuration → Custom webhooks](../guide/configuration.md#custom-webhooks).

### GitHub App Installation Events

`installation` webhook events (`created`, ...) are auto-provisioned as a fallback: a group named after the installing account (`inst-{installationId}`, bound via `installationId`) is created automatically, or existing groups whose `owners` match the installing account are bound to the installation. See [Configuration → GitHub App tenant isolation](../guide/configuration.md#github-app-tenant-isolation).

The primary flow is the App's **Setup URL** — set it to `{BASE_URL}/auth/github/install`. After a user installs the App, the browser lands on:

| Method | Path                        | Description                                                                                    |
|--------|-----------------------------|------------------------------------------------------------------------------------------------|
| `GET`  | `/auth/github/install`      | Choice page: bind the installation to a new group or an existing group the signed-in user owns |
| `POST` | `/auth/github/install/bind` | Provisions the binding (owner role re-checked) and redirects to `/admin?install=ok`            |

## Error Format

All error responses follow the format:

```json
{
  "error": "Description of the error"
}
```
