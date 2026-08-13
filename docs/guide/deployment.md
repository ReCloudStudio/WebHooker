# Deployment

## Cloudflare Setup

### 1. Create KV Namespace

```bash
bunx wrangler kv namespace create KV
```

This outputs a namespace ID. Update `wrangler.jsonc` with the ID:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "your-namespace-id",
    },
  ],
}
```

### 2. Set Secrets

```bash
bunx wrangler secret put GITHUB_WEBHOOK_SECRET
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put DISCORD_TOKEN
bunx wrangler secret put DISCORD_PUBLIC_KEY   # Discord app public key (Developer Portal) — required for interactions
bunx wrangler secret put TELEGRAM_TOKEN       # Telegram bot token (BotFather) — required for Telegram routes
bunx wrangler secret put ADMIN_USER_IDS       # comma-separated GitHub IDs/logins allowed into the Web UI
```

::: tip Target channels are configured per route
There is no global channel secret. Each route in the [Web UI](/guide/configuration#web-ui) declares its own target channel (and optional thread), so `DISCORD_CHANNEL_ID` is not needed.
:::

::: tip GitHub App ID / private key are unused
`GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` are not currently used by the code — the
OAuth flow only needs `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. You do not need to
set them (no PKCS#8 conversion required).
:::

Discord interactions arrive via the HTTPS Interactions Endpoint, so set `DISCORD_PUBLIC_KEY` and point the **Interactions Endpoint URL** at `https://your-domain/discord/interactions`. See [Interactions Endpoint](#interactions-endpoint) below.

### 3. Create D1 Database and Run Migrations

```bash
bunx wrangler d1 create webhooker
```

Copy the returned database ID into `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webhooker",
      "database_id": "your-database-id",
    },
  ],
}
```

Then apply the migrations:

```bash
bun run db:migrate:prod   # apply migrations to the remote D1 database
bun run db:migrate        # apply migrations to the local (Miniflare) database
```

The `db:migrate` scripts run `wrangler d1 migrations apply webhooker` (see `package.json`), which applies each SQL file in `migrations/` and records applied versions in the `d1_migrations` table.

::: tip Databases previously migrated with `d1 execute`
If the database already has these tables/columns (e.g. previously migrated with `wrangler d1 execute --file`), the `d1_migrations` tracking table may be missing and `db:migrate:prod` will try to re-run every migration. The `ALTER TABLE ... ADD COLUMN` statements in `0002_log_detail.sql` then fail because the columns already exist. In that case run the files directly instead:

```bash
bunx wrangler d1 execute webhooker --remote --file ./migrations/0001_init.sql
bunx wrangler d1 execute webhooker --remote --file ./migrations/0002_log_detail.sql
bunx wrangler d1 execute webhooker --remote --file ./migrations/0003_telegram_links.sql
bunx wrangler d1 execute webhooker --remote --file ./migrations/0004_add_group_id.sql
bunx wrangler d1 execute webhooker --remote --file ./migrations/0005_audit_logs.sql
```

:::

### 4. Deploy

```bash
bunx wrangler deploy
```

Your worker is now live at `https://webhooker.<your-subdomain>.workers.dev`.

### 5. Configure GitHub Webhook

1. Go to your GitHub App settings
2. Set **Webhook URL** to `https://webhooker.<your-subdomain>.workers.dev/webhook`
3. Set **Webhook secret** to match `GITHUB_WEBHOOK_SECRET`

### 6. (Optional) Configure Gitea Webhook

1. In your Gitea repo, go to **Settings → Webhooks → Add Webhook → Gitea**
2. Set **Target URL** to `https://webhooker.<your-subdomain>.workers.dev/webhook`
3. Set **HTTP Method** to `POST` and **Content Type** to `application/json`
4. Set **Secret** to match `GITEA_WEBHOOK_SECRET`
5. Choose the events to trigger (push, issues, pull requests, releases, ...)

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
4. Subscribe to events (all 28 supported):
   - Push, Pull request, Issues, Issue comment, Workflow run, Workflow job, Status, Deployment, Deployment status, Ping, Release, Create, Delete, Star, Fork, Check run, Check suite, Pull request review, Pull request review comment, Commit comment, Member, Label, Milestone, Discussion, Discussion comment, Repository, Code scanning alert, Dependabot alert
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

1. Go to <https://discord.com/developers/applications>
2. Create a new application → go to Bot section
3. Copy the bot token to `DISCORD_TOKEN`
4. Invite the bot with the `bot` and `applications.commands` scopes and the `View Channels` + `Send Messages` + `Send Messages in Threads` permissions (combined integer `274877910016`):

   ```text
   https://discord.com/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=274877910016&scope=bot+applications.commands
   ```

5. Configure target channels **per route** in the Web UI (`/admin`) — no global channel ID is required.

### Interactions Endpoint

Messages are sent via the Discord **REST API**, so pushing works with just `DISCORD_TOKEN`. Interactions (slash commands, buttons, modals) arrive through the HTTPS Interactions Endpoint:

1. Copy the application **Public Key** (Developer Portal → General Information) to `DISCORD_PUBLIC_KEY`.
2. Set the **Interactions Endpoint URL** to `https://your-domain/discord/interactions`.
3. Every interaction request is verified with Ed25519 signatures (`X-Signature-Ed25519` over `X-Signature-Timestamp + body`).

The `/gh` slash command and the `GitHub: 添加/编辑/删除评论` message commands are synced by the scheduled trigger (every 5 minutes): per-guild for instant availability, plus a global registration (24h dedup, ~1h propagation). The bot never connects to the Discord Gateway, so it shows as **offline** — messaging is unaffected (always REST).

Users run `/gh login` to link their GitHub account and can then comment on issues/PRs as themselves. See the [README](https://github.com/ReCloudStudio/WebHooker#bot-commands-comment-on-github-as-yourself) for the full command reference.

## Telegram Bot Setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token to `TELEGRAM_TOKEN`.
2. (Optional) Set `TELEGRAM_WEBHOOK_SECRET`; the webhook registration passes it to Telegram as `secret_token`, and `POST /telegram/webhook` verifies it with a timing-safe compare.
3. The worker syncs the webhook from the scheduled trigger (`setWebhook` to `{BASE_URL}/telegram/webhook`), so no manual `setWebhook` call is needed — just make sure `BASE_URL` is set.
4. Add the bot to a group (or enable topics) and route events to `chatId` / `topicId` in the route config.

In Telegram, `/gh` commands work by replying to a notification message:

- `/gh login` — link your GitHub account (returns an OAuth link)
- `/gh logout` — unlink
- `/gh comment <text>` — reply to an issue/PR notification to comment as yourself
- `/gh merge` / `/gh close` — reply to a PR notification to merge/close it

Avatars are rendered as a link-preview card using the built-in `GET /api/richheader` (overridable with `TELEGRAM_RICH_HEADER_HOST`).

## Custom Domain (Optional)

To use a custom domain instead of `*.workers.dev`:

1. Go to your Cloudflare Worker settings
2. Add a custom domain or route
3. Update `BASE_URL` to match

> [!NOTE]
> This project is a Cloudflare Worker. It requires the KV and D1 bindings declared in `wrangler.jsonc`, so it cannot run as a standalone Node/container process.
