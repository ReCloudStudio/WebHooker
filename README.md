# WebHooker

GitHub webhook → Discord / Telegram dispatcher. Receives webhook events via Cloudflare Workers, applies filters, and routes formatted messages to Discord channels/threads and Telegram chats/topics.

## Features

- **28 event formatters** — push, pull_request, issues, issue_comment, workflow_run, workflow_job, status, deployment, deployment_status, check_run, check_suite, ping, release, create, delete, star, fork, pull_request_review, pull_request_review_comment, commit_comment, member, label, milestone, discussion, discussion_comment, repository, code_scanning_alert, dependabot_alert (+ generic fallback)
- HMAC-SHA256 signature verification (Web Crypto API)
- Filter by event type, repo, actor, action, branch, keyword (supports regex)
- Rich messages with color coding, author avatars, fields, and timestamps — rendered as Discord embeds and Telegram HTML
- Route to Discord channels/threads and Telegram chats/topics (multi-target routes)
- `workflow_run` progress is edited **in place** (single message updated as the workflow advances) on both platforms
- GitHub OAuth for user actions (comment, edit comment, delete comment, merge, close, react)
- **Web UI config console** (`/admin`) — manage routes and groups with GitHub OAuth + admin whitelist, view send logs
- **Discord Interactions Endpoint** (Ed25519-verified) for `/gh` slash commands, message context-menu commands, PR merge/close buttons, and comment modals
- **Telegram `/gh` commands** (login/logout/comment/merge/close) via the Telegram webhook, with avatar link-preview cards
- Cloudflare KV for token/state/config/session storage + D1 for send logs and platform account links
- Graceful degradation (webhook-only mode if Discord unavailable)

## Architecture

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → verify → dedup → filter → format → Discord (REST) / Telegram (Bot API)
                 ├── POST /discord/interactions → verify (Ed25519) → handle command/button/modal
                 ├── POST /telegram/webhook → verify (secret token) → handle /gh commands
                 ├── GET  /auth/github → OAuth flow
                 ├── GET  /api/richheader → Telegram avatar link-preview card
                 ├── POST /api/* → user actions (Bearer token auth)
                 ├── /admin → routes, groups & send logs Web UI
                 └── GET  /health → status check
```

- **Cloudflare Worker** — HTTP ingress, signature verification, routing, platform dispatch
- **Interactions Endpoint** — HTTPS callback (no Discord Gateway connection, no Durable Object); the bot stays offline and commands are registered via the API
- **KV** — token storage (`token:{userId}`), OAuth state (`state:{hex}`), route config (`config:routes`), group config (`config:groups`), admin sessions (`session:{id}`), delivery dedup (`delivery:{id}`), message-update tracking (`msg:*`)
- **D1** — send logs (`send_logs`), Discord↔GitHub links (`discord_links`), Telegram↔GitHub links (`telegram_links`)

## Quick Start

```bash
npm install          # or bun install
cp .env.example .dev.vars   # Fill in secrets for local dev
npx wrangler dev     # Start local dev server
```

## Configuration

### Secrets (`.dev.vars` for local, Worker Secrets for production)

| Variable                    | Description                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`     | Webhook secret from GitHub                                                                     |
| `GITHUB_APP_ID`             | GitHub App ID (not currently used by the code; kept for compatibility)                         |
| `GITHUB_PRIVATE_KEY`        | App private key (PKCS#8 PEM; not currently used by the code; kept for compatibility)           |
| `GITHUB_CLIENT_ID`          | OAuth client ID                                                                                |
| `GITHUB_CLIENT_SECRET`      | OAuth client secret                                                                            |
| `DISCORD_TOKEN`             | Bot token                                                                                      |
| `DISCORD_PUBLIC_KEY`        | Discord application public key (from the Developer Portal) — required for interactions         |
| `DISCORD_APPLICATION_ID`    | Discord application id (optional; auto-resolved via `GET /oauth2/applications/@me` if omitted) |
| `TELEGRAM_TOKEN`            | Telegram bot token (from BotFather) — required for Telegram routes                             |
| `TELEGRAM_WEBHOOK_SECRET`   | Optional secret token for `POST /telegram/webhook` verification                                |
| `TELEGRAM_RICH_HEADER_HOST` | Optional base URL overriding the built-in `GET /api/richheader` for Telegram avatar cards      |
| `BASE_URL`                  | Public URL for OAuth callbacks and the Telegram webhook sync                                   |
| `ADMIN_USER_IDS`            | Comma-separated GitHub user IDs (or logins) allowed to access `/admin`                         |
| `DOCS_URL`                  | Optional docs site URL used by the landing page                                                |
| `GITHUB_REPO_URL`           | Optional GitHub repo URL used by the landing page                                              |
| `LEGAL_CONTACT`             | Optional contact shown on `/terms` and `/privacy`                                              |

### Routes

Routes are stored in KV (`config:routes` as JSON). There are **no default routes** — every route (including its target) must be defined explicitly, either via the Web UI (`/admin`) or by storing a JSON array in KV. A route may carry multiple `targets`, so one rule can forward to several channels at once:

```json
[
  {
    "id": "all-push",
    "name": "Push Events",
    "enabled": true,
    "groupId": "default",
    "filters": [{ "type": "event", "match": "push" }],
    "targets": [
      { "platform": "discord", "channelId": "CHANNEL_ID" },
      { "platform": "telegram", "chatId": "-1001234567890" }
    ]
  }
]
```

`target.platform` selects the push target: `discord` (default) or `telegram`. Discord targets require `target.channelId` (optional `threadId` for a thread); Telegram targets require `target.chatId` (optional `topicId` for a topic). The legacy singular `target` field is still migrated automatically. There is no fallback to a default channel.

Routes belong to **groups** (KV `config:groups`) that scope admin access and can restrict which org/user events flow in. See `config.example.yaml` and `docs/guide/configuration.md` for the full schema.

### Web UI (`/admin`)

The built-in config console lets you manage routes and groups in the browser (add / edit / delete / toggle / reorder), and inspect send logs — no KV access needed:

1. Set `ADMIN_USER_IDS` to the GitHub user IDs (or logins) allowed to manage the console, e.g. `ADMIN_USER_IDS=12345,RhenCloud`.
2. Visit `/admin` and sign in with GitHub. Only users in the whitelist get access.
3. Changes are written to KV immediately and picked up by the webhook pipeline.

Sign out at `/admin/logout`.

See `config.example.yaml` for full syntax examples.

### Filter Types

| Type      | Matches                                | Notes                                                                                                              |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `event`   | `push`, `pull_request`, `issues`, etc. | GitHub event name                                                                                                  |
| `repo`    | `org/repo` full name                   |                                                                                                                    |
| `actor`   | Sender login                           |                                                                                                                    |
| `action`  | `opened`, `closed`, `published`, etc.  |                                                                                                                    |
| `branch`  | Branch name                            | Works for push, PR/review, create/delete, workflow_run, workflow_job, check_suite, deployment, code_scanning_alert |
| `keyword` | Text in payload body                   | Supports regex patterns; falls back to substring match                                                             |

Set `exclude: true` to invert any filter.

## API

### Health

- `GET /health` — Returns `{"status": "ok"}`

### OAuth

- `GET /auth/github` — Start GitHub OAuth flow (redirects to GitHub)
- `GET /auth/github/callback` — OAuth callback (exchanges code for token; admin session / Discord link / Telegram link)
- `DELETE /auth/token/:userId` — Revoke user token

### Actions (require `Authorization: Bearer <token>` header)

- `POST /api/comment` — Create issue comment
- `POST /api/merge` — Merge pull request
- `POST /api/close` — Close pull request
- `POST /api/react` — Add reaction to issue

### Admin (require admin OAuth session)

- `GET /admin` — Config console UI
- `GET /admin/login` — Start admin sign-in (GitHub OAuth)
- `GET /admin/logout` — Sign out
- `GET /admin/api/routes` — List routes
- `PUT /admin/api/routes` — Replace routes
- `GET /admin/api/groups` — List groups (scoped)
- `PUT /admin/api/groups` — Replace groups (super admin only)
- `GET /admin/api/groups/:groupId/routes` — List a group's routes
- `PUT /admin/api/groups/:groupId/routes` — Replace a group's routes
- `GET /admin/api/me` — Current session / scope
- `GET /admin/api/logs` — Send logs (scoped)
- `GET /admin/api/logs/:id` — Single send-log entry

## GitHub App Setup

### 1. Create App

1. Go to <https://github.com/settings/apps/new>
2. Fill in:
   - **GitHub App name**: `WebHooker` (or your choice)
   - **Homepage URL**: your domain
   - **Webhook URL**: `https://your-domain/webhook`
   - **Webhook secret**: generate and copy to `GITHUB_WEBHOOK_SECRET`
3. Set permissions:
   - **Repository permissions**: Contents (read), Issues (write), Pull requests (write), Metadata (read), Checks (read), Deployments (read), Discussions (read), Code scanning alerts (read), Dependabot alerts (read)
   - **Organization permissions**: Members (read) — if needed
4. Subscribe to events:
   - Push, Pull request, Issues, Issue comment, Workflow run, Workflow job, Status, Deployment, Deployment status, Ping, Release, Create, Delete, Star, Fork, Check run, Check suite, Pull request review, Pull request review comment, Commit comment, Member, Label, Milestone, Discussion, Discussion comment, Repository, Code scanning alert, Dependabot alert
5. Generate private key — `GITHUB_PRIVATE_KEY` is currently unused by the code (only client ID/secret power the OAuth flow), so it is optional; store it if you later enable GitHub App authentication.

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

| Item         | How                                                                   |
| ------------ | --------------------------------------------------------------------- |
| Public key   | `DISCORD_PUBLIC_KEY` set + Interactions Endpoint URL configured       |
| Invite scope | Bot invited with `applications.commands` (see invite URL above)       |
| OAuth        | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and `BASE_URL` configured |
| User linked  | Each user runs `/gh login` first                                      |

## Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token to `TELEGRAM_TOKEN`.
2. (Optional) Set `TELEGRAM_WEBHOOK_SECRET`; the webhook registration passes it to Telegram as the `secret_token`, and `POST /telegram/webhook` verifies it with a timing-safe compare.
3. The worker syncs the webhook from the scheduled trigger (`setWebhook` to `{BASE_URL}/telegram/webhook`), so no manual `setWebhook` call is needed — just make sure `BASE_URL` is set.
4. Add the bot to a group (or enable topics) and route events to `chatId` / `topicId` in the route config.

In Telegram, `/gh` commands work by replying to a notification message:

- `/gh login` — link your GitHub account (returns an OAuth link)
- `/gh logout` — unlink
- `/gh comment <text>` — reply to an issue/PR notification to comment as yourself
- `/gh merge` / `/gh close` — reply to a PR notification to merge/close it

Avatars are rendered as a link-preview card using the built-in `GET /api/richheader` (overridable with `TELEGRAM_RICH_HEADER_HOST`).

## Deployment

```bash
# Set secrets in Cloudflare
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put ADMIN_USER_IDS

# Create KV namespace
npx wrangler kv namespace create KV
# Update wrangler.jsonc with the KV namespace ID

# Create D1 database and run migrations
npx wrangler d1 create webhooker
# Update wrangler.jsonc d1_databases with the database ID
npm run db:migrate:prod   # apply migrations to the remote D1 database

# Deploy
npx wrangler deploy
```

## Development

```bash
npx wrangler dev      # Local dev server (Miniflare)
npm run typecheck     # Type checking
npm run lint          # ESLint
npm test              # Unit tests (bun test)
```

## Supported Events

| Event                         | Formatter                                               |
| ----------------------------- | ------------------------------------------------------- |
| `push`                        | Commit list, branch, author                             |
| `pull_request`                | PR title, branch, diff stats                            |
| `issues`                      | Issue title, labels, assignees                          |
| `issue_comment`               | Comment body, issue reference                           |
| `workflow_run`                | Workflow status, conclusion, duration (edited in place) |
| `workflow_job`                | Job name, status, conclusion                            |
| `status`                      | Commit status, context, state                           |
| `deployment`                  | Environment, ref, task                                  |
| `deployment_status`           | Environment, status, commit ref                         |
| `check_run`                   | Status, conclusion, details URL                         |
| `check_suite`                 | Suite conclusion, head branch, commit                   |
| `ping`                        | Webhook confirmation                                    |
| `release`                     | Tag, body, assets                                       |
| `create` / `delete`           | Branch/tag creation/deletion                            |
| `star`                        | Star count, repository                                  |
| `fork`                        | Fork source → target                                    |
| `pull_request_review`         | Review state, body preview                              |
| `pull_request_review_comment` | Inline code comment, file path, line                    |
| `commit_comment`              | Commit SHA, comment body                                |
| `member`                      | Collaborator add/remove                                 |
| `label`                       | Label name, color, description                          |
| `milestone`                   | Progress bar, open/closed counts, due date              |
| `discussion`                  | Discussion title, category, action                      |
| `discussion_comment`          | Comment body, discussion reference                      |
| `repository`                  | Repo rename/transfer details                            |
| `code_scanning_alert`         | Severity, rule ID, file path                            |
| `dependabot_alert`            | Severity, package, vulnerable range, fix version        |

Any other event type falls back to the generic formatter (event type, action, actor, repo, raw payload).

## License

MIT
