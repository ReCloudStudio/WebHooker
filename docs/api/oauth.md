# OAuth

WebHooker implements GitHub OAuth2 to enable user-initiated actions (comment, merge, react).

## Flow

```text
User → GET /auth/github → Redirect to GitHub → Authorize →
  → GET /auth/github/callback → Exchange code for token → Store in KV
```

## Endpoints

### Start OAuth

```
GET /auth/github
```

Redirects the user to GitHub's authorization page.

**Query Parameters:**

| Parameter | Description                        |
| --------- | ---------------------------------- |
| `userId`  | Your application's user identifier |

**Response:** `302` redirect to GitHub OAuth authorize URL.

### OAuth Callback

```
GET /auth/github/callback
```

GitHub redirects here after authorization. Exchanges the code for an access token and stores it in KV.

**Query Parameters (from GitHub):**

| Parameter | Description                         |
| --------- | ----------------------------------- |
| `code`    | Authorization code                  |
| `state`   | State parameter for CSRF protection |

**Response:** Redirects to your `BASE_URL` with a success/error indicator.

### Revoke Token

```
DELETE /auth/token/:userId
```

Removes the stored OAuth token for a user.

**Response:**

```json
{
  "ok": true
}
```

## Token Storage

Tokens are stored in KV with key pattern `token:{userId}`:

```json
{
  "accessToken": "gho_...",
  "expiresAt": "2025-01-01T00:00:00.000Z"
}
```

Tokens are automatically expired based on the `expiresAt` timestamp.

## Using Tokens

After OAuth, include the access token in the `Authorization` header for action API calls:

```bash
curl -X POST https://your-worker/api/comment \
  -H "Authorization: Bearer gho_..." \
  -H "Content-Type: application/json" \
  -d '{"owner": "org", "repo": "repo", "issueNumber": 1, "body": "Hello!"}'
```
