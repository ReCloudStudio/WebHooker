# Introduction

WebHooker is a GitHub webhook dispatcher built on Cloudflare Workers. It receives GitHub webhook events, applies configurable filters, formats them into rich Discord embeds, and routes messages to Discord channels or threads via a Durable Object-maintained Gateway connection.

## Architecture

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → verify → filter → format → DO (Discord Gateway) → Discord
                 ├── GET  /auth/github → OAuth flow
                 ├── POST /api/* → user actions (Bearer token auth)
                 └── GET  /health → status check
```

### Components

| Component                           | Role                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| **Cloudflare Worker**               | HTTP ingress, signature verification, event parsing, route matching                           |
| **Durable Object (DiscordGateway)** | Persistent WebSocket to Discord Gateway, channel cache, message dispatch with retry           |
| **KV**                              | Token storage (`token:{userId}`), OAuth state (`state:{hex}`), route config (`config:routes`) |

### Data Flow

1. GitHub sends a webhook to `POST /webhook`
2. Worker verifies the HMAC-SHA256 signature
3. Worker parses the event type and payload
4. Routes are evaluated against filters (event, repo, actor, action, branch, keyword)
5. Matching routes trigger formatter functions that produce Discord embeds
6. Messages are dispatched to the Durable Object, which maintains the Gateway connection
7. DO sends messages to Discord via REST API with rate-limit retry

## Tech Stack

- **Runtime**: Cloudflare Workers
- **HTTP Framework**: Hono
- **Discord Gateway**: Durable Object (persistent WebSocket + channel cache)
- **Storage**: Cloudflare KV
- **Auth**: Web Crypto API (HMAC-SHA256), jose (JWT), octokit (GitHub API)
- **Language**: TypeScript

## License

MIT
