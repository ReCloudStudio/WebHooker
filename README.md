# WebHooker

GitHub webhook → Discord dispatcher. Receives webhook events via Cloudflare Workers, applies filters, and routes formatted messages to Discord channels or threads.

## Features

- **23 event formatters** — push, pull_request, issues, issue_comment, workflow_run, release, create, delete, star, fork, check_run, pull_request_review, pull_request_review_comment, commit_comment, deployment_status, member, label, milestone, discussion, discussion_comment, repository, code_scanning_alert, dependabot_alert (+ generic fallback)
- HMAC-SHA256 signature verification (Web Crypto API)
- Filter by event type, repo, actor, action, branch (incl. PR), keyword (supports regex)
- Rich Discord embeds with color coding, author avatars, fields, and timestamps
- Route to channels or threads
- GitHub App OAuth for user actions (comment, merge, react)
- **Web UI config console** (`/admin`) — manage routes with GitHub OAuth + admin whitelist
- **Discord Interactions Endpoint** (Ed25519-verified) for `/gh` slash commands, message context-menu commands, PR merge/close buttons, and comment modals
- Cloudflare KV for token/state/config storage
- Graceful degradation (webhook-only mode if Discord unavailable)

## Architecture

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → verify → filter → format → Discord (REST)
                 ├── POST /discord/interactions → verify (Ed25519) → handle command/button/modal
                 ├── GET  /auth/github → OAuth flow
                 ├── POST /api/* → user actions (Bearer token auth)
                 └── GET  /health → status check
```

- **Cloudflare Worker** — HTTP ingress, signature verification, routing, Discord REST dispatch
- **Interactions Endpoint** — HTTPS callback (no Discord Gateway connection, no Durable Object); the bot stays offline and commands are registered via the API
- **KV** — Token storage (`token:{userId}`), OAuth state (`state:{hex}`), route config (`config:routes`)

## Quick Start

```bash
npm install          # or bun install
cp .env.example .dev.vars   # Fill in secrets for local dev
npx wrangler dev     # Start local dev server
```

## Configuration

### Secrets (`.dev.vars` for local, Worker Secrets for production)

| Variable                  | Description                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`   | Webhook secret from GitHub                                                                    |
| `GITHUB_APP_ID`           | GitHub App ID                                                                                 |
| `GITHUB_PRIVATE_KEY`      | App private key (PEM)                                                                         |
| `GITHUB_CLIENT_ID`        | OAuth client ID                                                                               |
| `GITHUB_CLIENT_SECRET`    | OAuth client secret                                                                           |
| `DISCORD_TOKEN`           | Bot token                                                                                     |
| `DISCORD_PUBLIC_KEY`      | Discord application public key (from the Developer Portal) — required for interactions        |
| `DISCORD_APPLICATION_ID`  | Discord application id (optional; auto-resolved via `GET /oauth2/applications/@me` if omitted) |
| `BASE_URL`                | Public URL for OAuth callbacks                                                                |
| `ADMIN_USER_IDS`          | Comma-separated GitHub user IDs (or logins) allowed to access `/admin`                        |

### Routes

Routes are stored in KV (`config:routes` as JSON). There are **no default routes** — every route (including its target `channelId` / `threadId`) must be defined explicitly, either via the Web UI (`/admin`) or by storing a JSON array in KV:

```json
[
  {
    "id": "all-push",
    "name": "Push Events",
    "enabled": true,
    "filters": [{ "type": "event", "match": "push" }],
    "target": { "channelId": "CHANNEL_ID" }
  }
]
```

The `target.channelId` is required and is used as-is; there is no fallback to a default channel.

### Web UI (`/admin`)

The built-in config console lets you manage routes in the browser (add / edit / delete / toggle / reorder), no KV access needed:

1. Set `ADMIN_USER_IDS` to the GitHub user IDs (or logins) allowed to manage the console, e.g. `ADMIN_USER_IDS=12345,RhenCloud`.
2. Visit `/admin` and sign in with GitHub. Only users in the whitelist get access.
3. Changes are written to KV `config:routes` immediately and picked up by the webhook pipeline.

Sign out at `/admin/logout`.

See `config.example.yaml` for full syntax examples.

### Filter Types

| Type      | Matches                                | Notes                                                                |
| --------- | -------------------------------------- | -------------------------------------------------------------------- |
| `event`   | `push`, `pull_request`, `issues`, etc. | GitHub event name                                                    |
| `repo`    | `org/repo` full name                   |                                                                      |
| `actor`   | Sender login                           |                                                                      |
| `action`  | `opened`, `closed`, `published`, etc.  |                                                                      |
| `branch`  | Branch name                            | Works for push, PR, create/delete, workflow_run, code_scanning_alert |
| `keyword` | Text in payload body                   | Supports regex patterns; falls back to substring match               |

Set `exclude: true` to invert any filter.

## API

### Health

- `GET /health` — Returns `{"status": "ok"}`

### OAuth

- `GET /auth/github` — Start GitHub OAuth flow (redirects to GitHub)
- `GET /auth/github/callback` — OAuth callback (exchanges code for token)
- `DELETE /auth/token/:userId` — Revoke user token

### Actions (require `Authorization: Bearer <token>` header)

- `POST /api/comment` — Create issue comment
- `POST /api/merge` — Merge pull request
- `POST /api/react` — Add reaction to issue

### Admin (require admin OAuth session)

- `GET /admin` — Config console UI
- `GET /admin/login` — Start admin sign-in (GitHub OAuth)
- `GET /admin/logout` — Sign out
- `GET /admin/api/routes` — List routes
- `PUT /admin/api/routes` — Replace routes

## GitHub App Setup

### 1. Create App

1. Go to <https://github.com/settings/apps/new>
2. Fill in:
   - **GitHub App name**: `WebHooker` (or your choice)
   - **Homepage URL**: your domain
   - **Webhook URL**: `https://your-domain/webhook`
   - **Webhook secret**: generate and copy to `GITHUB_WEBHOOK_SECRET`
3. Set permissions:
   - **Repository permissions**: Contents (read), Issues (write), Pull requests (write), Metadata (read)
   - **Organization permissions**: Members (read) — if needed
4. Subscribe to events:
   - Push, Pull request, Issues, Issue comment, Workflow run, Release, Create, Delete, Star, Fork, Check run, Pull request review, Pull request review comment, Commit comment, Deployment status, Member, Label, Milestone, Discussion, Discussion comment, Repository, Code scanning alert, Dependabot alert
5. Generate private key → save contents to `GITHUB_PRIVATE_KEY` env var

### 2. Install App

1. After creation, go to the App settings page
2. Click "Install App" → select org/user
3. Choose repositories to monitor

### 3. Configure OAuth

1. Go to App → OAuth settings
2. Set **Callback URL**: `https://your-domain/auth/github/callback`
3. Copy Client ID and Client Secret to env

## Discord Bot Setup

Create a bot at <https://discord.com/developers/applications>, copy its token to `DISCORD_TOKEN`.

### OAuth2 Invite

Add the bot to your server with the `bot` scope and the following permissions:

| Permission               | Value          | Why                                             |
| ------------------------ | -------------- | ----------------------------------------------- |
| View Channels            | `1024`         | See the target channel to post messages         |
| Send Messages            | `2048`         | Send embeds/messages to channels                |
| Send Messages in Threads | `274877906944` | Send to threads when a route targets `threadId` |

Combined permission integer: `274877910016`

Invite URL (replace `CLIENT_ID` with your bot's client ID). The `applications.commands` scope is required so the slash / context-menu commands can be registered:

```
https://discord.com/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=274877910016&scope=bot+applications.commands
```

### Interactions Endpoint

Copy the application **Public Key** (Developer Portal → General Information) to `DISCORD_PUBLIC_KEY` and set the **Interactions Endpoint URL** to `https://your-domain/discord/interactions`. All interactions (slash commands, buttons, modals) are verified with Ed25519 signatures.

The bot never connects to the Discord Gateway, so it shows as **offline** — messaging is unaffected (always REST).

### Bot Commands (comment on GitHub as yourself)

The bot registers native **slash** and **message context-menu** commands, synced by the scheduled trigger (every 5 minutes): per-guild for instant availability, and globally (24h dedup, ~1h propagation). Comments are posted using **your own** linked GitHub account (OAuth), and permission is delegated to GitHub — if GitHub rejects the action (e.g. editing someone else's comment) the bot tells you so. All replies are ephemeral (only you see them).

**1. Link your account** (once):

```
/gh login     → returns an ephemeral link to authorize your GitHub account
/gh logout    → unlink your GitHub account
```

**2. Add / edit / delete a comment** — two equivalent ways:

- **Right-click a notification** (recommended): right-click a bot-issued issue / PR / comment notification → **Apps** → **GitHub: 添加评论 / 编辑评论 / 删除评论**. The target is auto-extracted from the notification embed; no link needed.
- **Slash command with a link**:

  ```
  /gh comment add  link:<issue or PR url>          e.g. https://github.com/owner/repo/issues/123
  /gh comment edit link:<comment url>              url must contain #issuecomment-<id>
  /gh comment del  link:<comment url>              url must contain #issuecomment-<id>
  ```

  For `edit` / `del`, copy the specific comment link on GitHub (comment ⋯ menu → **Copy link**). `add` / `edit` open a modal to enter/adjust the comment body (prefilled for edit).

**3. Merge / close a PR** — notifications for open PRs include **合并 / 关闭** (merge/close) buttons:

- Clicking a button merges (squash) or closes the PR as **your linked** GitHub account; GitHub enforces permission. On success the buttons are removed from the notification and the result is shown in an ephemeral reply.

**Requirements:**

| Item             | How                                                               |
| ---------------- | ----------------------------------------------------------------- |
| Public key       | `DISCORD_PUBLIC_KEY` set + Interactions Endpoint URL configured   |
| Invite scope     | Bot invited with `applications.commands` (see invite URL above)   |
| OAuth            | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and `BASE_URL` configured |
| User linked      | Each user runs `/gh login` first                                  |

## Deployment

```bash
# Set secrets in Cloudflare
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_PRIVATE_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_CHANNEL_ID

# Create KV namespace
npx wrangler kv namespace create KV

# Update wrangler.jsonc with the KV namespace ID

# Deploy
npx wrangler deploy
```

## Development

```bash
npx wrangler dev      # Local dev server (Miniflare)
npm run typecheck     # Type checking
npm run lint          # ESLint
```

## Supported Events

| Event                         | Formatter                                        |
| ----------------------------- | ------------------------------------------------ |
| `push`                        | Commit list, branch, author                      |
| `pull_request`                | PR title, branch, diff stats                     |
| `issues`                      | Issue title, labels, assignees                   |
| `issue_comment`               | Comment body, issue reference                    |
| `workflow_run`                | Workflow status, conclusion, duration            |
| `release`                     | Tag, body, assets                                |
| `create` / `delete`           | Branch/tag creation/deletion                     |
| `star`                        | Star count, repository                           |
| `fork`                        | Fork source → target                             |
| `check_run`                   | Status, conclusion, details URL                  |
| `pull_request_review`         | Review state, body preview                       |
| `pull_request_review_comment` | Inline code comment, file path, line             |
| `commit_comment`              | Commit SHA, comment body                         |
| `deployment_status`           | Environment, status, commit ref                  |
| `member`                      | Collaborator add/remove                          |
| `label`                       | Label name, color, description                   |
| `milestone`                   | Progress bar, open/closed counts, due date       |
| `discussion`                  | Discussion title, category, action               |
| `discussion_comment`          | Comment body, discussion reference               |
| `repository`                  | Repo rename/transfer details                     |
| `code_scanning_alert`         | Severity, rule ID, file path                     |
| `dependabot_alert`            | Severity, package, vulnerable range, fix version |

## License

MIT
