# Introduction

WebHooker is a GitHub webhook dispatcher built on Cloudflare Workers. It receives GitHub webhook events, applies configurable filters, formats them into rich Discord embeds, and delivers them to Discord channels or threads through the Discord REST API. In-Discord `/gh` interactions arrive via an HTTPS Interactions Endpoint (Ed25519-verified). Routes are managed through a built-in Web UI.

## Architecture

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → verify → dedup → filter → format → Discord (REST API)
                 ├── GET  /auth/github → OAuth flow
                 ├── POST /api/* → user actions (Bearer token auth)
                 ├── /admin → routes & send-log Web UI (admin session)
                  └── GET  /health → status check

POST /discord/interactions → verify (Ed25519) → handle /gh slash & context commands
```

### Components

| Component                           | Role                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Cloudflare Worker**               | HTTP ingress, signature verification, delivery dedup, event parsing, route matching, REST send                           |
| **Interactions Endpoint**            | Verifies Ed25519 signatures and handles `/gh` interactions (slash commands, context-menu commands, buttons, modals) |
| **KV**                              | Token storage (`token:{userId}`), OAuth state (`state:{hex}`), route config (`config:routes`), send logs, delivery dedup |

### Data Flow

1. GitHub sends a webhook to `POST /webhook`
2. Worker verifies the HMAC-SHA256 signature
3. Worker deduplicates by `X-GitHub-Delivery` (KV, short TTL) to drop repeat deliveries
4. Worker parses the event type and payload
5. Routes are evaluated against filters (event, repo, actor, action, branch, keyword)
6. Matching routes trigger formatter functions that produce Discord embeds
7. Each message is sent to its route's target channel/thread via the Discord REST API with rate-limit retry, and the result is recorded in the send log

## Tech Stack

- **Runtime**: Cloudflare Workers
- **HTTP Framework**: Hono
- **Discord delivery**: Discord REST API (interactions via an Ed25519-verified HTTPS Interactions Endpoint)
- **Web UI**: Nuxt 3 static SPA served from Worker assets
- **Storage**: Cloudflare KV
- **Auth**: Web Crypto API (HMAC-SHA256), jose (JWT), octokit (GitHub API)
- **Language**: TypeScript

## License

MIT
