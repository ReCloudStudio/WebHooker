# 简介

WebHooker 是一个基于 Cloudflare Workers 构建的 GitHub webhook 调度器。它接收 GitHub webhook 事件，应用可配置的过滤器，将事件格式化为丰富的 Discord 嵌入消息，并通过 Durable Object 维护的 Gateway 连接将消息路由到 Discord 频道或帖子。

## 架构

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → 验证 → 过滤 → 格式化 → DO (Discord Gateway) → Discord
                 ├── GET  /auth/github → OAuth 流程
                 ├── POST /api/* → 用户操作 (Bearer Token 鉴权)
                 └── GET  /health → 健康检查
```

### 组件

| 组件 | 职责 |
| --- | --- |
| **Cloudflare Worker** | HTTP 入口、签名验证、事件解析、路由匹配 |
| **Durable Object (DiscordGateway)** | 持久 WebSocket 连接 Discord Gateway、频道缓存、带重试的消息分发 |
| **KV** | Token 存储 (`token:{userId}`)、OAuth 状态 (`state:{hex}`)、路由配置 (`config:routes`) |

### 数据流

1. GitHub 发送 webhook 到 `POST /webhook`
2. Worker 验证 HMAC-SHA256 签名
3. Worker 解析事件类型和载荷
4. 根据过滤器评估路由（event、repo、actor、action、branch、keyword）
5. 匹配的路由触发格式化器函数生成 Discord 嵌入消息
6. 消息被分发到 Durable Object，由其维护 Gateway 连接
7. DO 通过 REST API 将消息发送到 Discord，并处理速率限制重试

## 技术栈

- **运行时**: Cloudflare Workers
- **HTTP 框架**: Hono
- **Discord Gateway**: Durable Object (持久 WebSocket + 频道缓存)
- **存储**: Cloudflare KV
- **鉴权**: Web Crypto API (HMAC-SHA256)、jose (JWT)、octokit (GitHub API)
- **语言**: TypeScript

## 许可证

MIT
