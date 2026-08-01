# 简介

WebHooker 是一个基于 Cloudflare Workers 构建的 GitHub webhook 调度器。它接收 GitHub webhook 事件，应用可配置的过滤器，将事件格式化为丰富的 Discord 嵌入消息，并通过 Discord REST API 投递到 Discord 频道或帖子。一个可选的 Durable Object 持有 Gateway 连接，用于让 Bot 保持在线并支持 Discord 内的 `/gh` 命令。路由通过内置的 Web UI 管理。

## 架构

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → 验证 → 去重 → 过滤 → 格式化 → Discord (REST API)
                 ├── GET  /auth/github → OAuth 流程
                 ├── POST /api/* → 用户操作 (Bearer Token 鉴权)
                 ├── /admin → 路由与发送日志 Web UI（管理员会话）
                 └── GET  /health → 健康检查

（可选）Durable Object ⇄ Discord Gateway  →  Bot 在线 + /gh 斜杠与右键命令
```

### 组件

| 组件                                | 职责                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Cloudflare Worker**               | HTTP 入口、签名验证、投递去重、事件解析、路由匹配、REST 发送                                              |
| **Durable Object (DiscordGateway)** | _可选。_ 保持 Gateway 连接（Bot 在线）并处理 `/gh` 交互                                                   |
| **KV**                              | Token 存储 (`token:{userId}`)、OAuth 状态 (`state:{hex}`)、路由配置 (`config:routes`)、发送日志、投递去重 |

### 数据流

1. GitHub 发送 webhook 到 `POST /webhook`
2. Worker 验证 HMAC-SHA256 签名
3. Worker 按 `X-GitHub-Delivery` 去重（KV，短 TTL），丢弃重复投递
4. Worker 解析事件类型和载荷
5. 根据过滤器评估路由（event、repo、actor、action、branch、keyword）
6. 匹配的路由触发格式化器函数生成 Discord 嵌入消息
7. 每条消息通过 Discord REST API 发送到对应路由的目标频道/帖子，并处理速率限制重试，结果记录到发送日志

## 技术栈

- **运行时**: Cloudflare Workers
- **HTTP 框架**: Hono
- **Discord 投递**: Discord REST API（Gateway 通过可选的 Durable Object 提供在线状态与 `/gh` 命令）
- **Web UI**: Nuxt 3 静态 SPA，由 Worker 资源托管
- **存储**: Cloudflare KV
- **鉴权**: Web Crypto API (HMAC-SHA256)、jose (JWT)、octokit (GitHub API)
- **语言**: TypeScript

## 许可证

MIT
