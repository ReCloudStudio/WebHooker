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

| Parameter  | Description                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `redirect` | Optional relative path to return to after sign-in (e.g. `/admin`). Must start with `/` but not `//`; any unsafe value falls back to `/`. |

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

**Response:**

- **Browser flow** (`Accept: text/html`): sets an admin session cookie, then redirects to the `redirect` target. Users without admin access are redirected to `/admin?error=forbidden`.
- **JSON flow**: returns `{ "userId": "...", "login": "...", "redirectTo": "..." }`.
- **Discord link flow** (started with a pending `discordUserId`): links the Discord user to this GitHub account, returning `{ "ok": true, "discordUserId": "...", "login": "..." }` — or a success page in the browser.

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
  "userId": "12345",
  "accessToken": "gho_...",
  "expiresAt": 1735689600000,
  "refreshToken": "..."
}
```

`expiresAt` is a Unix timestamp in milliseconds. KV entries expire at 90% of the token's lifetime (minimum 60 seconds). A reverse index `token-reverse:{sha256 of token}` maps the access token back to its user id so Bearer-authenticated endpoints can resolve the caller. Discord users linked to a GitHub account are stored in the D1 `discord_links` table.

## Using Tokens

After OAuth, include the access token in the `Authorization` header for action API calls:

```bash
curl -X POST https://your-worker/api/comment \
  -H "Authorization: Bearer gho_..." \
  -H "Content-Type: application/json" \
  -d '{"owner": "org", "repo": "repo", "issueNumber": 1, "body": "Hello!"}'
```
