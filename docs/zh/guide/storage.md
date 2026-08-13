# 存储布局

## KV 存储布局

| 键模式                         | 值                                                                            | TTL                |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `config:routes`                | 路由 JSON 数组                                                                | 永久               |
| `config:groups`                | 分组 JSON 数组                                                                | 永久               |
| `session:{id}`                 | 管理员会话 `{ userId, login }`                                                | 7 天               |
| `token:{userId}`               | `{ userId, accessToken, expiresAt, refreshToken? }`                           | 0.9 × Token 有效期 |
| `token-reverse:{sha256}`       | 用于按 Token 反查的用户 id                                                    | 0.9 × Token 有效期 |
| `state:{hex}`                  | `{ redirectTo, expiresAt, discordUserId?, telegramUserId?, telegramChatId? }` | 600 秒             |
| `invite:{token}`               | `{ groupId, role, expiresAt, createdBy, note? }`                              | 7 天               |
| `invite:group:{id}`            | 每组的 Token 索引（保证邀请列表一致性）                                       | 永久               |
| `delivery:{id}`                | Webhook 投递 id（去重标记）                                                   | 300 秒             |
| `delivery:{groupId}:{id}`      | 分组级 webhook 入口的租户级投递去重                                           | 300 秒             |
| `tenant:{groupId}`             | 分组 webhook secret（64 位 hex，控制台生成）                                  | 永久               |
| `msg:{routeId}:{key}:{target}` | 原地更新用消息 id 追踪（如 `workflow_run` / `check_run`）                     | 7 天               |
| `cmd:guild:{id}`               | 已注册命令的服务器 id（去重）                                                 | 永久               |
| `cmd:registered:global`        | 全局命令注册标记（去重）                                                      | 1 天               |
| `config:discord-app-id`        | 缓存的 Discord 应用 id                                                        | 永久               |
| `i18n:{lang}`                  | 叠加在英文之上的翻译覆盖                                                      | 永久               |

## D1 存储布局

D1 数据库（`DB` 绑定，数据库 `webhooker`）包含四张表：

| 表               | 用途                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `send_logs`      | 每次分发尝试一行（路由 id、事件、目标、ok/error、耗时、错误码、详情）  |
| `audit_logs`     | 每次管理员操作一行（登录/登出、分组/路由/成员/邀请变更）               |
| `discord_links`  | 映射 `discord_user_id` → `github_user_id`，供 `/gh` Discord 命令使用   |
| `telegram_links` | 映射 `telegram_user_id` → `github_user_id`，供 `/gh` Telegram 命令使用 |

`audit_logs` 由定时任务在 `AUDIT_RETENTION_DAYS`（默认 90）后自动清理。行字段说明见[日志](./logs)。
