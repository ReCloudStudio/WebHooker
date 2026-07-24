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

| 参数 | 说明 |
| --- | --- |
| `userId` | 你的应用用户标识符 |

**响应：** `302` 重定向到 GitHub OAuth 授权 URL。

### OAuth 回调

```
GET /auth/github/callback
```

GitHub 授权后重定向到此地址。将 code 交换为访问令牌并存储到 KV。

**查询参数（来自 GitHub）：**

| 参数 | 说明 |
| --- | --- |
| `code` | 授权码 |
| `state` | CSRF 保护的状态参数 |

**响应：** 重定向到你的 `BASE_URL`，附带成功/失败指示。

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
  "accessToken": "gho_...",
  "expiresAt": "2025-01-01T00:00:00.000Z"
}
```

Token 会根据 `expiresAt` 时间戳自动过期。

## 使用 Token

OAuth 完成后，在操作 API 调用的 `Authorization` 头中包含访问令牌：

```bash
curl -X POST https://your-worker/api/comment \
  -H "Authorization: Bearer gho_..." \
  -H "Content-Type: application/json" \
  -d '{"owner": "org", "repo": "repo", "issueNumber": 1, "body": "你好！"}'
```
