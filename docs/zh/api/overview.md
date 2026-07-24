# API 概览

WebHooker 通过 Hono 在 Cloudflare Workers 上提供 HTTP API。

## 基础 URL

```
https://your-worker.workers.dev
```

## 端点

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/health` | 无 | 健康检查 |
| `POST` | `/webhook` | HMAC 签名 | GitHub webhook 接入 |
| `GET` | `/auth/github` | 无 | 启动 GitHub OAuth 流程 |
| `GET` | `/auth/github/callback` | 无 | OAuth 回调 |
| `DELETE` | `/auth/token/:userId` | 无 | 撤销用户 Token |
| `POST` | `/api/comment` | Bearer Token | 创建议题评论 |
| `POST` | `/api/merge` | Bearer Token | 合并拉取请求 |
| `POST` | `/api/react` | Bearer Token | 添加议题反应 |

## 健康检查

```
GET /health
```

**响应：**

```json
{
  "status": "ok"
}
```

## Webhook 接入

```
POST /webhook
```

接受 GitHub webhook 载荷。需要有效的 `X-Hub-Signature-256` 头部。

**请求头：**

| 头部 | 必需 | 说明 |
| --- | --- | --- |
| `X-Hub-Signature-256` | 是 | HMAC-SHA256 签名 |
| `X-GitHub-Event` | 是 | 事件类型名称 |
| `X-GitHub-Delivery` | 是 | 唯一投递 ID |

**请求体：** GitHub webhook JSON 载荷（最大 1MB）。

**响应：**

```json
{
  "ok": true
}
```

**错误响应：**

| 状态码 | 响应体 | 原因 |
| --- | --- | --- |
| `401` | `{"error": "Invalid signature"}` | 签名验证失败 |
| `400` | `{"error": "Invalid event"}` | 缺少事件头或格式错误的请求体 |
| `413` | `{"error": "Request too large"}` | 请求体超过 1MB 限制 |

## 错误格式

所有错误响应都遵循以下格式：

```json
{
  "error": "错误的说明"
}
```
