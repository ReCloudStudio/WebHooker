# 定时任务

WebHooker 通过定时触发器（`*/5 * * * *`，每 5 分钟）运行四个维护任务。它们只在部署后的 Worker 上运行（Cloudflare cron）；本地 `wrangler dev` 可用 `wrangler dev --test-scheduled` 触发。

| 任务            | 用途                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `discord-sync`  | 注册 Discord 斜杠/右键菜单命令：按服务器即时注册，并全局注册（24h 去重，约 1 小时传播）                             |
| `telegram-sync` | 调用 `setWebhook` 指向 `{BASE_URL}/telegram/webhook`（设置了 `TELEGRAM_WEBHOOK_SECRET` 时作为 `secret_token` 传入） |
| `audit-prune`   | 删除早于 `AUDIT_RETENTION_DAYS`（默认 90）天的 `audit_logs` 记录                                                    |
| `storage-prune` | 删除已过期的 `dedup_keys` 记录、超过 7 天的 `delivery_state` 记录和超过 30 天的 `message_tracking` 记录             |

除任务用到的密钥（`DISCORD_TOKEN`、`DISCORD_APPLICATION_ID`、`TELEGRAM_TOKEN`、`BASE_URL`、`AUDIT_RETENTION_DAYS`）外无需其他配置。
