# OAuth

WebHooker 实现 GitHub OAuth2 以支持用户发起的操作（评论、合并、反应）。

## 流程

```text
用户 → GET /auth/github → 重定向到 GitHub → 授权 →
  → GET /auth/github/callback → 交换 code 获取 Token → 存储到 KV
```

## 端点

### 启动 OAuth

```
GET /auth/github
```

将用户重定向到 GitHub 的授权页面。

**查询参数：**

| 参数       | 说明                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `redirect` | 可选，登录后返回的相对路径（如 `/admin`）。必须以 `/` 开头但不能以 `//` 开头；任何不安全的值回退为 `/`。 |

**响应：** `302` 重定向到 GitHub OAuth 授权 URL。

### OAuth 回调

```
GET /auth/github/callback
```

GitHub 授权后重定向到此地址。将 code 交换为访问令牌并存储到 KV。

**查询参数（来自 GitHub）：**

| 参数    | 说明                |
| ------- | ------------------- |
| `code`  | 授权码              |
| `state` | CSRF 保护的状态参数 |

**响应：**

- **浏览器流程**（`Accept: text/html`）：设置管理员会话 Cookie，然后重定向到 `redirect` 目标；无管理权限的用户被重定向到 `/admin?error=forbidden`。
- **JSON 流程**：返回 `{ "userId": "...", "login": "...", "redirectTo": "..." }`。
- **Discord 绑定流程**（以未决的 `discordUserId` 启动时）：将 Discord 用户绑定到此 GitHub 账号，返回 `{ "ok": true, "discordUserId": "...", "login": "..." }`——浏览器中则显示成功页面。
- **Telegram 绑定流程**（以未决的 `telegramUserId` 启动时）：将 Telegram 用户绑定到此 GitHub 账号，返回 `{ "ok": true, "telegramUserId": "...", "login": "..." }`，并向未决的 `telegramChatId` 发送确认消息。

### 撤销 Token

```
DELETE /auth/token/:userId
```

删除用户存储的 OAuth Token。

**响应：**

```json
{
  "ok": true
}
```

## Token 存储

Token 以键模式 `token:{userId}` 存储在 KV 中：

```json
{
  "userId": "12345",
  "accessToken": "gho_...",
  "expiresAt": 1735689600000,
  "refreshToken": "..."
}
```

`expiresAt` 是毫秒级 Unix 时间戳。KV 条目在 Token 有效期的 90% 时过期（至少 60 秒）。反向索引 `token-reverse:{sha256 of token}` 将访问令牌映射回用户 id，使 Bearer 鉴权的端点能解析调用者。与 GitHub 账号绑定的 Discord 用户存储在 D1 的 `discord_links` 表中；Telegram 用户存储在 D1 的 `telegram_links` 表中。

## 使用 Token

OAuth 完成后，在操作 API 调用的 `Authorization` 头中包含访问令牌：

```bash
curl -X POST https://your-worker/api/comment \
  -H "Authorization: Bearer gho_..." \
  -H "Content-Type: application/json" \
  -d '{"owner": "org", "repo": "repo", "issueNumber": 1, "body": "你好！"}'
```
