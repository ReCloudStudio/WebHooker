# 配置

## 密钥

WebHooker 需要多个密钥才能运行。本地开发时存储在 `.dev.vars` 中，生产环境使用 Cloudflare Worker Secrets。

### 必需密钥

| 变量                    | 说明                               |
| ----------------------- | ---------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | GitHub App 设置中的 Webhook 密钥   |
| `GITHUB_APP_ID`         | GitHub App 的数字 ID               |
| `GITHUB_PRIVATE_KEY`    | App 私钥（PEM 格式，用 `\n` 转义） |
| `GITHUB_CLIENT_ID`      | App 设置中的 OAuth 客户端 ID       |
| `GITHUB_CLIENT_SECRET`  | App 设置中的 OAuth 客户端密钥      |
| `DISCORD_TOKEN`         | Discord Bot Token                  |

### 可选密钥

| 变量                      | 说明                                                                       | 默认值                  |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------- |
| `BASE_URL`                | OAuth 回调的公开 URL                                                       | `http://localhost:8787` |
| `ADMIN_USER_IDS`          | 允许访问 WebUI 的 GitHub 用户 ID（或登录名），逗号分隔                     | 未设置时 WebUI 关闭     |
| `DISCORD_GATEWAY_ENABLED` | 设为 `true` 连接 Discord Gateway（bot 在线状态）；不启用也能通过 REST 推送 | `false`                 |

## Web 控制台

WebHooker 内置了位于 `/admin` 的配置控制台，可在浏览器中管理路由。它由 GitHub OAuth 和管理员白名单保护。

### 设置

1. 配置 `ADMIN_USER_IDS`，填写允许管理路由的 GitHub 用户 ID，也支持登录名，例如 `ADMIN_USER_IDS=12345,RhenCloud`。未设置时控制台禁用。
2. 打开 `/admin` 并使用 GitHub 登录。
3. 只有白名单中的用户会获得会话 Cookie；其他人收到 `403`。

### 端点

| 端点                    | 说明                   |
| ----------------------- | ---------------------- |
| `GET /admin`            | 配置控制台页面         |
| `GET /admin/login`      | 开始 GitHub OAuth 登录 |
| `GET /admin/logout`     | 销毁会话               |
| `GET /admin/api/routes` | 列出路由（仅管理员）   |
| `PUT /admin/api/routes` | 替换路由（仅管理员）   |

控制台支持新增、编辑、删除和开关路由。保存后立即写入 KV `config:routes` 并使配置缓存失效，下一次 webhook 处理即会生效。

## 路由

路由定义了哪些事件被转发到哪些 Discord 频道。它们以 JSON 数组形式存储在 Cloudflare KV 中，键为 `config:routes`。

**没有默认路由**——每条路由必须自行定义目标频道。若未配置任何路由，则不会转发任何事件。

### 路由模式

```json
{
  "id": "unique-route-id",
  "name": "可读名称",
  "enabled": true,
  "filters": [
    { "type": "event", "match": "push" },
    { "type": "repo", "match": "org/repo", "exclude": false }
  ],
  "target": {
    "channelId": "必填频道ID",
    "threadId": "可选线程ID"
  }
}
```

`target.channelId` 必填且按原样使用，不存在默认频道回退。

### 自定义路由示例

```json
[
  {
    "id": "backend-prs",
    "name": "后端 PR",
    "enabled": true,
    "filters": [
      { "type": "repo", "match": "myorg/backend" },
      { "type": "event", "match": "pull_request" },
      { "type": "actor", "match": "[bot]", "exclude": true }
    ],
    "target": {
      "channelId": "1234567890",
      "threadId": "9876543210"
    }
  }
]
```

## 过滤器类型

| 类型      | 匹配对象         | 示例                             |
| --------- | ---------------- | -------------------------------- |
| `event`   | GitHub 事件名称  | `push`, `pull_request`, `issues` |
| `repo`    | 仓库全名         | `org/repo`                       |
| `actor`   | 发送者登录名     | `username`, `[bot]`              |
| `action`  | 事件操作         | `opened`, `closed`, `published`  |
| `branch`  | 分支名称         | `main`, `feature/*`              |
| `keyword` | 载荷正文中的文本 | `deploy`, `/fix\s+\d+/` (正则)   |

### 过滤器行为

- 路由中的所有过滤器必须都匹配才触发路由（AND 逻辑）
- 在任何过滤器上设置 `"exclude": true` 可反转匹配逻辑（NOT 逻辑）
- `keyword` 过滤器支持正则表达式——如果正则有误，回退到子串匹配
- `branch` 过滤器适用于 push、pull_request、create/delete、workflow_run 和 code_scanning_alert 事件

### 匹配值

过滤器接受单个字符串或字符串数组：

```json
{ "type": "event", "match": "push" }
{ "type": "event", "match": ["push", "pull_request"] }
```

## KV 存储布局

| 键模式           | 值                             | TTL    |
| ---------------- | ------------------------------ | ------ |
| `config:routes`  | JSON 路由数组                  | 永久   |
| `session:{id}`   | 管理员会话 `{ userId, login }` | 7 天   |
| `token:{userId}` | `{ accessToken, expiresAt }`   | 至过期 |
| `state:{hex}`    | `{ userId, createdAt }`        | 600 秒 |
