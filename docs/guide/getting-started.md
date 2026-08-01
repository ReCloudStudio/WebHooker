# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudflare account](https://dash.cloudflare.com/) (free tier works)
- A [GitHub App](https://github.com/settings/apps/new) (see [GitHub App Setup](/guide/deployment#github-app-setup))
- A Discord bot token (see [Discord Bot Setup](/guide/deployment#discord-bot-setup))

## Installation

```bash
git clone https://github.com/ReCloudStudio/WebHooker.git
cd WebHooker
npm install
```

## Local Development

### 1. Configure Secrets

Copy the example env file and fill in your secrets:

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars` with your actual values:

```bash
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
DISCORD_TOKEN=your-bot-token
ADMIN_USER_IDS=your-github-id,your-github-login
BASE_URL=http://localhost:8787
```

::: tip
`GITHUB_PRIVATE_KEY` must be in **PKCS#8** format (`BEGIN PRIVATE KEY`). Convert a GitHub-issued PKCS#1 key with `openssl pkcs8 -topk8 -nocrypt -in app.pem -out pkcs8.pem`. Target channels are set per route in the Web UI, so no `DISCORD_CHANNEL_ID` is needed. To keep the bot online and enable `/gh` slash commands locally, also set `DISCORD_GATEWAY_ENABLED=true`.
:::

::: warning
`.dev.vars` is gitignored and contains secrets. Never commit it.
:::

### 2. Start Dev Server

```bash
npm run dev
```

This starts a local Miniflare environment at `http://localhost:8787`.

### 3. Verify

```bash
curl http://localhost:8787/health
# → {"status":"ok"}
```

## Available Scripts

| Script                 | Description                       |
| ---------------------- | --------------------------------- |
| `npm run dev`          | Start local dev server (wrangler) |
| `npm run deploy`       | Deploy to Cloudflare              |
| `npm run typecheck`    | TypeScript type checking          |
| `npm run lint`         | ESLint                            |
| `npm run lint:md`      | Markdownlint                      |
| `npm run format`       | Format with Prettier              |
| `npm run format:check` | Check Prettier formatting         |
| `npm run docs:dev`     | Start docs dev server             |
| `npm run docs:build`   | Build docs site                   |
