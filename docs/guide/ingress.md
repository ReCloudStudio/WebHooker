# Webhook Ingress & Tenancy

## Webhook Providers

WebHooker ingests webhooks from multiple forges through the same `POST /webhook` endpoint; the provider is auto-detected from the request headers, so point every forge's webhook at `{BASE_URL}/webhook`.

| Provider | Event header     | Signature header      | Signature format           | Secret                  |
|----------|------------------|-----------------------|----------------------------|-------------------------|
| GitHub   | `X-GitHub-Event` | `X-Hub-Signature-256` | `sha256=<hex>` HMAC-SHA256 | `GITHUB_WEBHOOK_SECRET` |
| Gitea    | `X-Gitea-Event`  | `X-Gitea-Signature`   | plain hex HMAC-SHA256      | `GITEA_WEBHOOK_SECRET`  |

Delivery-id dedup uses `X-GitHub-Delivery` (GitHub) or `X-Gitea-Delivery` (Gitea) when present.

Gitea payloads are normalized to the same internal shape as GitHub events, so routes, filters, and the 28 formatters work unchanged. Unknown or unmapped Gitea events fall back to the generic formatter. Repository/commit/user links are derived from the payload's `repository.html_url`, so they point at your Gitea instance.

## Global Endpoint (`POST /webhook`)

The global endpoint verifies payloads against the operator's global secrets (`GITHUB_WEBHOOK_SECRET`, `GITEA_WEBHOOK_SECRET`) and dispatches into **all** routes. GitHub App installations deliver here; use `installationId` on groups to keep tenants isolated.

## Per-Group Endpoint (`POST /webhook/{groupId}`)

Every group can opt into its own webhook ingress with an independent secret (generated from the group page — Webhook endpoint panel, owner role). Payloads are verified against the **group's** secret instead of the global ones, and only that group's routes are eligible. This is how SaaS users configure Gitea, classic GitHub, or custom webhooks without sharing (or knowing) the operator's secrets.

- Supported for any provider: GitHub (`X-Hub-Signature-256`), Gitea (`X-Gitea-Signature`), custom (`X-WebHooker-Signature`)
- The secret is a 64-char hex string; regenerate from the console invalidates the old one immediately
- Delivery-id dedup keys are tenant-scoped (`delivery:{groupId}:{id}`)
- When the group has no secret (or no longer exists) the endpoint returns `404`

## Custom Webhooks

Post arbitrary JSON to `POST /webhook/{groupId}` (or the global endpoint) with the body signed as `X-WebHooker-Signature: sha256=<hmac-sha256 hex of the raw body>` using the group's secret. The payload becomes a `custom` event that flows through the normal route pipeline — create a route with `event: custom` (there is a console template) and it dispatches to that route's targets, records `send_logs`, and appears in the group's webhook log channel.

Payload schema:

```json
{
  "title": "Deploy failed",
  "description": "Prod rollout failed at 12:03 UTC",
  "color": "red",
  "url": "https://ci.example.com/runs/42",
  "repo": "acme/widget",
  "author": {
    "name": "alice",
    "iconUrl": "https://…/alice.png",
    "url": "https://github.com/alice"
  },
  "fields": [{ "name": "Env", "value": "prod", "inline": true }],
  "footer": "my-monitor",
  "deliveryId": "alert-123"
}
```

| Field         | Type     | Description                                                                                                      |
|---------------|----------|------------------------------------------------------------------------------------------------------------------|
| `title`       | string   | Message title (falls back to "Custom message")                                                                   |
| `description` | string   | Optional message body                                                                                            |
| `color`       | string   | Optional embed color: a word (`red`, `green`, `yellow`, `blue`, `purple`, `orange`, `cyan`, `gray`) or `#rrggbb` |
| `url`         | string   | Optional link for the title                                                                                      |
| `repo`        | string   | Optional `owner/repo`; prefixes the title and is used as the footer                                              |
| `author`      | object   | Optional `{ name, iconUrl, url }`                                                                                |
| `fields`      | object[] | Optional embed fields `{ name, value, inline }`                                                                  |
| `footer`      | string   | Optional footer override                                                                                         |
| `deliveryId`  | string   | Optional id for sender-side dedup (retries)                                                                      |

## GitHub App Tenant Isolation

When the GitHub App is installed, its events arrive at the global endpoint for **every** installation. To keep tenants apart, bind each group to the installation id that should feed it: `"installationId": 12345678`. The id is visible in the App's installation webhook payload (`installation.id`) or on the GitHub App installation page URL. Events from any other installation are rejected for that group even if its `owners` list is empty. Groups without `installationId` keep the legacy behavior (`owners` filtering).

Binding is **auto-configured** — the GitHub App's _Setup URL_ should point to `{BASE_URL}/auth/github/install`. Right after a user installs the App, the browser lands there (the page requires a signed-in admin session — not signed in users are redirected through the OAuth flow first) and they choose where the installation binds: a **new group** (`inst-{installationId}`, default) or any **existing group they own** (owner role checked again on submit; `POST /auth/github/install/bind` performs the provisioning). No manual id entry is needed. As a fallback (e.g. when the Setup URL is not configured), the `installation.created` webhook event creates/binds the group automatically — existing groups whose `owners` match the installing account are bound, otherwise a dedicated `inst-{installationId}` group is created. Then just add routes/members in the console.

To show the installing account's login on the choice page, set `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` — see [Secrets](./configuration#secrets).
