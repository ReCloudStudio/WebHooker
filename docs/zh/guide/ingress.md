# Webhook 接入与租户隔离

## Webhook 提供方

WebHooker 通过同一个 `POST /webhook` 端点接收多个 forge 的 webhook，按请求头自动识别来源；只需把各 forge 的 webhook 指向 `{BASE_URL}/webhook` 即可。

| 提供方 | 事件请求头       | 签名请求头            | 签名格式                   | 密钥                    |
| ------ | ---------------- | --------------------- | -------------------------- | ----------------------- |
| GitHub | `X-GitHub-Event` | `X-Hub-Signature-256` | `sha256=<hex>` HMAC-SHA256 | `GITHUB_WEBHOOK_SECRET` |
| Gitea  | `X-Gitea-Event`  | `X-Gitea-Signature`   | 纯 hex HMAC-SHA256         | `GITEA_WEBHOOK_SECRET`  |

投递 id 去重使用 `X-GitHub-Delivery`（GitHub）或 `X-Gitea-Delivery`（Gitea）请求头（存在时）。

Gitea 载荷会被归一化为与 GitHub 事件相同的内部结构，因此路由、过滤器与 28 个格式化器无需改动即可工作。未知或未映射的 Gitea 事件回退到通用格式化器。仓库/提交/用户链接取自载荷中的 `repository.html_url`，因此指向你的 Gitea 实例。

## 全局端点（`POST /webhook`）

全局端点使用运营者的全局密钥（`GITHUB_WEBHOOK_SECRET`、`GITEA_WEBHOOK_SECRET`）验签，并分发到**所有**路由。GitHub App 安装的事件都在此送达；在分组上设置 `installationId` 可保持租户隔离。

## 分组端点（`POST /webhook/{groupId}`）

每个分组都可以选择接入自己的 webhook 入口，使用独立的密钥（在分组页面的 _Webhook 端点_ 面板生成，owner 角色）。载荷使用**分组**的密钥验签，而不是全局密钥，并且只有该分组的路由会被触发。SaaS 用户以此配置 Gitea、经典 GitHub 或自定义 webhook，而无需共享（或知道）运营者的密钥。

- 支持任意提供方：GitHub（`X-Hub-Signature-256`）、Gitea（`X-Gitea-Signature`）、自定义（`X-WebHooker-Signature`）
- 密钥为 64 位 hex 字符串；在控制台重新生成会立即失效旧密钥
- 投递 id 去重键按提供方与租户隔离（`delivery:{provider}:{groupId}:{id}`）
- 分组没有密钥（或已不存在）时端点返回 `404`

## 自定义 Webhook

向 `POST /webhook/{groupId}`（或全局端点）POST 任意 JSON，并使用分组密钥将原始 body 的 HMAC-SHA256 以 `X-WebHooker-Signature: sha256=<hex>` 签名。载荷会变成 `custom` 事件，走正常的路由管线——创建一条 `event: custom` 的路由（控制台有模板），即可分发到该路由的目标、记录 `send_logs`，并出现在分组的 webhook 日志频道中。

### 重放防护

自定义 webhook 支持可选的防重放机制，在签名之外再附带两个请求头：

- `X-WebHooker-Timestamp` — 请求发送时的 Unix 秒数
- `X-WebHooker-Nonce` — 每次请求唯一且不可预测的值（如 UUID）

当**同时**提供这两个请求头时，签名改为对 `{timestamp}.{nonce}.{原始body}` 计算（而非仅原始 body），且仅当以下条件满足时才被接受：

1. 时间戳与服务器时钟相差不超过 ±5 分钟（拒绝重放与时钟漂移滥用）
2. nonce 从未被使用过（存入 KV 保留 10 分钟；重放的 nonce 会被拒绝）

```bash
input="${timestamp}.${nonce}.${body}"
signature="sha256=$(printf '%s' "$input" | openssl dgst -sha256 -hmac "$secret" -hex | sed 's/.*= //')"
```

省略这些请求头时，WebHooker 回退到旧版的仅对 body 签名，现有发送方无需改动即可继续工作。

载荷模式：

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

| 字段          | 类型     | 说明                                                                                                     |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `title`       | string   | 消息标题（缺省时为 "Custom message"）                                                                    |
| `description` | string   | 可选消息正文                                                                                             |
| `color`       | string   | 可选嵌入颜色：颜色词（`red`、`green`、`yellow`、`blue`、`purple`、`orange`、`cyan`、`gray`）或 `#rrggbb` |
| `url`         | string   | 可选的标题链接                                                                                           |
| `repo`        | string   | 可选 `owner/repo`；作为标题前缀并用作页脚                                                                |
| `author`      | object   | 可选 `{ name, iconUrl, url }`                                                                            |
| `fields`      | object[] | 可选嵌入字段 `{ name, value, inline }`                                                                   |
| `footer`      | string   | 可选页脚覆盖                                                                                             |
| `deliveryId`  | string   | 可选的发送方去重 id（重试）                                                                              |

## GitHub App 租户隔离

GitHub App 安装后，**所有**安装方的事件都会到达全局端点。要让租户互相隔离，请把每个分组绑定到应当为其提供事件的安装 ID：`"installationId": 12345678`。该 ID 可从 App 安装 webhook 载荷（`installation.id`）或 GitHub App 安装页 URL 看到。即使分组的 `owners` 为空，来自其它安装的事件也会被拒绝。未设置 `installationId` 的分组保持旧行为（`owners` 过滤）。

绑定是**自动配置**的 —— 将 GitHub App 的 _Setup URL_ 指向 `{BASE_URL}/auth/github/install`。用户安装 App 后浏览器立即跳转到该页面（页面需要已登录的管理员会话——未登录用户会先被重定向走 OAuth 流程），可选择将安装绑定到：**新分组**（`inst-{installationId}`，默认）或任意**自己拥有 owner 权限的已有分组**（提交时再次校验角色；由 `POST /auth/github/install/bind` 完成配置）。无需手动填写 ID。作为兜底（例如未配置 Setup URL 时），`installation.created` webhook 事件也会自动创建/绑定分组 —— `owners` 匹配安装账号的现有分组会被绑定，否则创建独立的 `inst-{installationId}` 分组。之后在控制台为分组添加路由和成员即可。

要在选择页显示安装所属账号的登录名，请设置 `GITHUB_APP_ID` 与 `GITHUB_PRIVATE_KEY`——见[密钥](./configuration#密钥)。
