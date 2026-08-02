# API 概览

WebHooker 通过 Hono 在 Cloudflare Workers 上提供 HTTP API。

## 基础 URL

```
https://your-worker.workers.dev
```

## 端点

| 方法     | 路径                           | 鉴权         | 说明                                  |
| -------- | ------------------------------ | ------------ | ------------------------------------- |
| `GET`    | `/health`                      | 无           | 健康检查                              |
| `POST`   | `/webhook`                     | HMAC 签名    | GitHub webhook 接入                   |
| `POST`   | `/discord/interactions`        | Ed25519 签名 | Discord 交互（斜杠命令、按钮、modal） |
| `POST`   | `/telegram/webhook`            | Secret token | Telegram 更新（bot `/gh` 命令）       |
| `GET`    | `/auth/github`                 | 无           | 启动 GitHub OAuth 流程                |
| `GET`    | `/auth/github/callback`        | 无           | OAuth 回调                            |
| `DELETE` | `/auth/token/:userId`          | 无           | 撤销用户 Token                        |
| `POST`   | `/api/comment`                 | Bearer Token | 创建议题评论                          |
| `POST`   | `/api/merge`                   | Bearer Token | 合并拉取请求                          |
| `POST`   | `/api/close`                   | Bearer Token | 关闭拉取请求                          |
| `POST`   | `/api/react`                   | Bearer Token | 添加议题反应                          |
| `GET`    | `/admin`                       | 管理员会话   | 配置控制台页面                        |
| `GET`    | `/admin/api/routes`            | 管理员会话   | 列出路由                              |
| `PUT`    | `/admin/api/routes`            | 管理员会话   | 替换路由                              |
| `GET`    | `/admin/api/groups`            | 管理员会话   | 列出分组（按权限过滤）                |
| `PUT`    | `/admin/api/groups`            | 管理员会话   | 替换分组（仅超级管理员）              |
| `GET`    | `/admin/api/groups/:id/routes` | 管理员会话   | 列出某分组的路由                      |
| `PUT`    | `/admin/api/groups/:id/routes` | 管理员会话   | 替换某分组的路由                      |
| `GET`    | `/admin/api/me`                | 管理员会话   | 当前会话信息                          |
| `GET`    | `/admin/api/logs`              | 管理员会话   | 发送日志（按权限过滤）                |

## 管理控制台

参见[配置 → Web 控制台](../guide/configuration.md#web-ui)了解设置方法。管理端点需要会话 Cookie，可通过 `GET /admin/login`（GitHub OAuth）获取；登录用户必须列在 `ADMIN_USER_IDS` 中。

- `GET /admin` — 提供配置控制台 HTML
- `GET /admin/api/routes` — 返回 `{ "routes": Route[] }`
- `PUT /admin/api/routes` — 请求体为 `{ "routes": Route[] }`；校验每条路由（id 格式、唯一 id、name、enabled、groupId、过滤器、平台感知的 target：Discord 需 `target.channelId`，Telegram 需 `target.chatId`）并持久化到 KV `config:routes`。返回 `200 { ok, count }` 或 `400 { error }` / `401 { error }`。

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

| 头部                  | 必需 | 说明             |
| --------------------- | ---- | ---------------- |
| `X-Hub-Signature-256` | 是   | HMAC-SHA256 签名 |
| `X-GitHub-Event`      | 是   | 事件类型名称     |
| `X-GitHub-Delivery`   | 是   | 唯一投递 ID      |

**请求体：** GitHub webhook JSON 载荷（最大 1MB）。

**响应：**

```json
{
  "ok": true
}
```

**错误响应：**

| 状态码 | 响应体                           | 原因                         |
| ------ | -------------------------------- | ---------------------------- |
| `401`  | `{"error": "Invalid signature"}` | 签名验证失败                 |
| `400`  | `{"error": "Invalid event"}`     | 缺少事件头或格式错误的请求体 |
| `413`  | `{"error": "Request too large"}` | 请求体超过 1MB 限制          |

## 错误格式

所有错误响应都遵循以下格式：

```json
{
  "error": "错误的说明"
}
```
