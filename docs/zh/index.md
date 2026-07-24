---
layout: home

hero:
  name: WebHooker
  text: GitHub Webhook → Discord
  tagline: 通过 Cloudflare Workers 接收 GitHub 事件，应用过滤器，将格式化消息路由到 Discord 频道或帖子。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/getting-started
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/ReCloudStudio/WebHooker

features:
  - title: 23 种事件格式化器
    details: 为 push、pull_request、issues、release、workflow_run 及其他 18 种事件类型提供丰富的 Discord 嵌入消息，支持颜色编码输出。
  - title: 灵活的过滤器
    details: 支持按事件类型、仓库、参与者、操作、分支（含 PR）和关键字（支持正则）过滤。支持排除模式。
  - title: Cloudflare Workers
    details: 运行在 Cloudflare 边缘网络上，使用 Durable Objects 维持持久的 Discord Gateway 连接，使用 KV 进行存储。
  - title: OAuth 与用户操作
    details: "GitHub App OAuth 流程支持用户发起操作：评论议题、合并 PR、添加反应 — 全部通过 Bearer Token 鉴权。"
  - title: 签名验证
    details: 使用 Web Crypto API 进行 HMAC-SHA256 webhook 签名验证，支持时间安全比较。
  - title: 优雅降级
    details: 当 Discord Token 不可用时以 webhook-only 模式运行。提供健康检查端点用于监控。
---
