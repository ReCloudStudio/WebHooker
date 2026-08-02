# Deployment

## Cloudflare Setup

### 1. Create KV Namespace

```bash
npx wrangler kv namespace create KV
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
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_PRIVATE_KEY   # PKCS#8 PEM (BEGIN PRIVATE KEY)
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY   # Discord app public key (Developer Portal) — required for interactions
npx wrangler secret put ADMIN_USER_IDS       # comma-separated GitHub IDs/logins allowed into the Web UI
```

::: tip Target channels are configured per route
There is no global channel secret. Each route in the [Web UI](/guide/configuration#web-ui) declares its own target channel (and optional thread), so `DISCORD_CHANNEL_ID` is not needed.
:::

::: warning GitHub App private key must be PKCS#8
GitHub issues private keys in PKCS#1 format (`BEGIN RSA PRIVATE KEY`). Cloudflare Workers' JWT signing requires PKCS#8. Convert first:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in your-app.private-key.pem -out gh_pk_pkcs8.pem
```

Then upload `gh_pk_pkcs8.pem` as `GITHUB_PRIVATE_KEY`.
:::

Discord interactions arrive via the HTTPS Interactions Endpoint, so set `DISCORD_PUBLIC_KEY` and point the **Interactions Endpoint URL** at `https://your-domain/discord/interactions`. See [Interactions Endpoint](#interactions-endpoint) below.

### 3. Deploy

```bash
npx wrangler deploy
```

Your worker is now live at `https://webhooker.<your-subdomain>.workers.dev`.

### 4. Configure GitHub Webhook

1. Go to your GitHub App settings
2. Set **Webhook URL** to `https://webhooker.<your-subdomain>.workers.dev/webhook`
3. Set **Webhook secret** to match `GITHUB_WEBHOOK_SECRET`

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
4. Subscribe to events (all 23 supported):
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

## Custom Domain (Optional)

To use a custom domain instead of `*.workers.dev`:

1. Go to your Cloudflare Worker settings
2. Add a custom domain or route
3. Update `BASE_URL` to match

## Docker

A Dockerfile is provided for containerized deployments (e.g., behind a reverse proxy):

```bash
docker build -t webhooker .
docker run -p 8787:8787 --env-file .env webhooker
```

Note: Docker mode runs without KV and other Cloudflare storage. Use Cloudflare deployment for full functionality.
