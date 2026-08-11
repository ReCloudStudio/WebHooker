# Introduction

WebHooker is a GitHub webhook dispatcher built on Cloudflare Workers. It receives GitHub webhook events, applies configurable filters, formats them into rich messages, and delivers them to Discord channels/threads (embeds) and Telegram chats/topics (HTML) via their REST APIs. In-Discord `/gh` interactions arrive via an HTTPS Interactions Endpoint (Ed25519-verified); Telegram `/gh` commands arrive via the Telegram webhook. Routes and groups are managed through a built-in Web UI.

## Architecture

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → verify → dedup → filter → format → Discord (REST) / Telegram (Bot API)
                 ├── POST /discord/interactions → verify (Ed25519) → handle /gh slash & context commands
                 ├── POST /telegram/webhook → verify (secret token) → handle /gh commands
                 ├── GET  /auth/github → OAuth flow
                 ├── GET  /api/richheader → Telegram avatar link-preview card
                 ├── POST /api/* → user actions (Bearer token auth)
                 ├── /admin → routes, groups & send-log Web UI (admin session)
                 └── GET  /health → status check
```

### Components

| Component                 | Role                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Worker**     | HTTP ingress, signature verification, delivery dedup, event parsing, route matching, platform dispatch                                                                                           |
| **Interactions Endpoint** | Verifies Ed25519 signatures and handles `/gh` interactions (slash commands, context-menu commands, buttons, modals)                                                                              |
| **KV**                    | Token storage (`token:{userId}`), OAuth state (`state:{hex}`), route config (`config:routes`), group config (`config:groups`), admin sessions, delivery dedup, message-update tracking (`msg:*`) |
| **D1**                    | Send logs (`send_logs`), Discord↔GitHub links (`discord_links`), Telegram↔GitHub links (`telegram_links`)                                                                                        |

### Data Flow

1. GitHub sends a webhook to `POST /webhook`
2. Worker verifies the HMAC-SHA256 signature
3. Worker deduplicates by `X-GitHub-Delivery` (KV, short TTL) to drop repeat deliveries
4. Worker parses the event type and payload
5. Routes are evaluated against filters (event, repo, actor, action, branch, keyword) and group owner restrictions
6. Matching routes trigger formatter functions that produce platform-neutral messages
7. Each message is sent to its route's target(s) via the Discord or Telegram REST API with rate-limit retry; `workflow_run` progress is edited in place. Every attempt is recorded in the D1 send log

## Tech Stack

- **Runtime**: Cloudflare Workers
- **HTTP Framework**: Hono
- **Discord delivery**: Discord REST API (interactions via an Ed25519-verified HTTPS Interactions Endpoint)
- **Telegram delivery**: Telegram Bot API (webhook with optional secret-token verification)
- **Web UI**: Nuxt 3 static SPA served from Worker assets
- **Storage**: Cloudflare KV + D1
- **Auth**: Web Crypto API (HMAC-SHA256, Ed25519), octokit (GitHub API)
- **Language**: TypeScript

## License

MIT
