---
layout: home

hero:
  name: WebHooker
  text: GitHub Webhook → Discord
  tagline: Receive GitHub events via Cloudflare Workers, apply filters, and route formatted messages to Discord channels or threads.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/ReCloudStudio/WebHooker

features:
  - title: 23 Event Formatters
    details: Rich Discord embeds for push, pull_request, issues, release, workflow_run, and 18 more event types with color-coded output.
  - title: Flexible Filtering
    details: Filter by event type, repo, actor, action, branch (including PRs), and keyword (with regex support). Exclude patterns with a flag.
  - title: Cloudflare Workers
    details: Runs on Cloudflare's edge network with Durable Objects for persistent Discord Gateway connections and KV for storage.
  - title: OAuth & User Actions
    details: "GitHub App OAuth flow enables user-initiated actions: comment on issues, merge PRs, add reactions — all via Bearer token auth."
  - title: Signature Verification
    details: HMAC-SHA256 webhook signature verification using the Web Crypto API with timing-safe comparison.
  - title: Graceful Degradation
    details: Runs in webhook-only mode if Discord token is unavailable. Health endpoint for monitoring.
---
