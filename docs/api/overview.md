# API Overview

WebHooker exposes an HTTP API via Hono on Cloudflare Workers.

## Base URL

```
https://your-worker.workers.dev
```

## Endpoints

| Method   | Path                    | Auth           | Description              |
| -------- | ----------------------- | -------------- | ------------------------ |
| `GET`    | `/health`               | None           | Health check             |
| `POST`   | `/webhook`              | HMAC signature | GitHub webhook ingestion |
| `GET`    | `/auth/github`          | None           | Start GitHub OAuth flow  |
| `GET`    | `/auth/github/callback` | None           | OAuth callback           |
| `DELETE` | `/auth/token/:userId`   | None           | Revoke user token        |
| `POST`   | `/api/comment`          | Bearer token   | Create issue comment     |
| `POST`   | `/api/merge`            | Bearer token   | Merge pull request       |
| `POST`   | `/api/react`            | Bearer token   | Add reaction to issue    |

## Health Check

```
GET /health
```

**Response:**

```json
{
  "status": "ok"
}
```

## Webhook Ingestion

```
POST /webhook
```

Accepts GitHub webhook payloads. Requires valid `X-Hub-Signature-256` header.

**Headers:**

| Header                | Required | Description           |
| --------------------- | -------- | --------------------- |
| `X-Hub-Signature-256` | Yes      | HMAC-SHA256 signature |
| `X-GitHub-Event`      | Yes      | Event type name       |
| `X-GitHub-Delivery`   | Yes      | Unique delivery ID    |

**Request Body:** GitHub webhook JSON payload (max 1MB).

**Response:**

```json
{
  "ok": true
}
```

**Error Responses:**

| Status | Body                             | Cause                                  |
| ------ | -------------------------------- | -------------------------------------- |
| `401`  | `{"error": "Invalid signature"}` | Signature verification failed          |
| `400`  | `{"error": "Invalid event"}`     | Missing event header or malformed body |
| `413`  | `{"error": "Request too large"}` | Body exceeds 1MB limit                 |

## Error Format

All error responses follow the format:

```json
{
  "error": "Description of the error"
}
```
