# 配置

## 密钥

WebHooker 需要多个密钥才能运行。本地开发时存储在 `.dev.vars` 中，生产环境使用 Cloudflare Worker Secrets。

### 必需密钥

| 变量 | 说明 |
| --- | --- |
| `GITHUB_WEBHOOK_SECRET` | GitHub App 设置中的 Webhook 密钥 |
| `GITHUB_APP_ID` | GitHub App 的数字 ID |
| `GITHUB_PRIVATE_KEY` | App 私钥（PEM 格式，用 `\n` 转义） |
| `GITHUB_CLIENT_ID` | App 设置中的 OAuth 客户端 ID |
| `GITHUB_CLIENT_SECRET` | App 设置中的 OAuth 客户端密钥 |
| `DISCORD_TOKEN` | Discord Bot Token |
| `DISCORD_CHANNEL_ID` | 消息发送的默认 Discord 频道 ID |

### 可选密钥

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `BASE_URL` | OAuth 回调的公开 URL | `http://localhost:8787` |

## 路由

路由定义了哪些事件被转发到哪些 Discord 频道。它们以 JSON 数组形式存储在 Cloudflare KV 中，键为 `config:routes`。

首次启动时，如果 KV 中没有配置，则使用 7 条默认路由。

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
    "channelId": "DISCORD_CHANNEL_ID",
    "threadId": "OPTIONAL_THREAD_ID"
  }
}
```

### 默认路由

| ID | 事件 | 说明 |
| --- | --- | --- |
| `all-push` | `push` | 所有推送事件 |
| `pull-requests` | `pull_request` | 所有 PR 活动 |
| `issues` | `issues` | 议题打开/关闭/编辑 |
| `issue-comments` | `issue_comment` | 议题和 PR 评论 |
| `workflow-runs` | `workflow_run` | CI/CD 工作流完成 |
| `releases` | `release` | 发布创建/编辑 |
| `branch-activity` | `create`, `delete` | 分支/标签创建和删除 |

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

| 类型 | 匹配对象 | 示例 |
| --- | --- | --- |
| `event` | GitHub 事件名称 | `push`, `pull_request`, `issues` |
| `repo` | 仓库全名 | `org/repo` |
| `actor` | 发送者登录名 | `username`, `[bot]` |
| `action` | 事件操作 | `opened`, `closed`, `published` |
| `branch` | 分支名称 | `main`, `feature/*` |
| `keyword` | 载荷正文中的文本 | `deploy`, `/fix\s+\d+/` (正则) |

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

| 键模式 | 值 | TTL |
| --- | --- | --- |
| `config:routes` | JSON 路由数组 | 永久 |
| `token:{userId}` | `{ accessToken, expiresAt }` | 至过期 |
| `state:{hex}` | `{ userId, createdAt }` | 600 秒 |
