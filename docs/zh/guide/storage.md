# 存储布局

## KV 存储布局

KV 只保留缓存数据和短期/临时状态。高频写入（webhook 去重、投递状态、消息追踪）存放在 D1，仅在 D1 不可用或未迁移时才回退到 KV（见[存储决策](#存储决策)）。

| 键模式                                     | 值                                                                            | TTL                |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `config:routes`                            | 路由配置缓存（D1 `d1_routes` 为权威数据源）                                   | 1 小时             |
| `config:groups`                            | 分组配置缓存（D1 `d1_groups` 为权威数据源）                                   | 1 小时             |
| `session:{id}`                             | 管理员会话 `{ userId, login }`                                                | 7 天               |
| `token:{userId}`                           | `{ userId, accessToken, expiresAt, refreshToken? }`                           | 0.9 × Token 有效期 |
| `token-reverse:{sha256}`                   | 用于按 Token 反查的用户 id                                                    | 0.9 × Token 有效期 |
| `state:{hex}`                              | `{ redirectTo, expiresAt, discordUserId?, telegramUserId?, telegramChatId? }` | 600 秒             |
| `invite:{token}`                           | `{ groupId, role, expiresAt, createdBy, note? }`                              | 7 天               |
| `invite:group:{id}`                        | 每组的 Token 索引（保证邀请列表一致性）                                       | 7 天               |
| `delivery:{provider}:{groupId}:{id}`       | Webhook 投递去重回退（D1 `dedup_keys` 为主）                                  | 7 天               |
| `delivery-state:{provider}:{groupId}:{id}` | 队列投递状态回退（D1 `delivery_state` 为主）                                  | 1 小时             |
| `queue:payload:{provider}:{groupId}:{id}`  | 暂存供队列消费者读取的超大 webhook 负载（R2 为主）                            | 1 小时             |
| `nonce:{nonce}`                            | 自定义 webhook 重放防护 nonce（一次性）                                       | 600 秒             |
| `tenant:{groupId}`                         | 分组 webhook secret（64 位 hex，控制台生成）                                  | 永久               |
| `msg:{routeId}:{key}:{target}`             | 消息 id 追踪回退（D1 `message_tracking` 为主）                                | 1 天               |
| `cmd:guild:{id}`                           | 已注册命令的服务器 id（去重）                                                 | 永久               |
| `cmd:registered:global`                    | 全局命令注册标记（去重）                                                      | 1 天               |
| `config:discord-app-id`                    | 缓存的 Discord 应用 id                                                        | 永久               |
| `i18n:{lang}`                              | 叠加在英文之上的翻译覆盖                                                      | 永久               |

## D1 存储布局

D1 数据库（`DB` 绑定，数据库 `webhooker`）保存配置、投递日志和高频临时状态的权威数据源：

| 表                 | 用途                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `d1_groups`        | 分组（权威配置，从旧版 KV `config:groups` 播种）                              |
| `d1_routes`        | 每组分组的路由（权威配置，从旧版 KV `config:routes` 播种）                    |
| `send_logs`        | 每次分发尝试一行（路由 id、事件、目标、ok/error、耗时、错误码、详情）         |
| `audit_logs`       | 每次管理员操作一行（登录/登出、分组/路由/成员/邀请变更）                      |
| `dedup_keys`       | Webhook 投递去重（原子 `INSERT ... ON CONFLICT` UPSERT，键 + 过期时间）       |
| `delivery_state`   | 队列投递状态（`pending`/`processing`/`delivered`/`retrying`/`failed`/`dead`） |
| `message_tracking` | 原地更新用消息 id 追踪（`event_id` + `target_id` → `message_id`）             |
| `discord_links`    | 映射 `discord_user_id` → `github_user_id`，供 `/gh` Discord 命令使用          |
| `telegram_links`   | 映射 `telegram_user_id` → `github_user_id`，供 `/gh` Telegram 命令使用        |

`audit_logs` 由定时任务在 `AUDIT_RETENTION_DAYS`（默认 90）后自动清理。`storage-prune` 任务会清理过期的 `dedup_keys`、超过 7 天的 `delivery_state` 行以及超过 30 天的 `message_tracking` 行。日志行字段说明见[日志](./logs)。

## R2 存储布局

R2（`PAYLOAD` 绑定，bucket `webhooker-payloads`）存储对队列消息或 KV 来说过大的 webhook 负载：

| 对象模式                          | 用途                           | 保留期     |
| --------------------------------- | ------------------------------ | ---------- |
| `webhooks/YYYY/MM/DD/<uuid>.json` | 暂存供队列消费者读取的超大负载 | 分发后删除 |

当缺少 `PAYLOAD` 绑定时，超大负载回退到 KV 键 `queue:payload:{provider}:{groupId}:{id}`（1 小时 TTL）。

## 存储决策

- **D1 是配置与投递元数据的权威数据源**；KV 只保存缓存和短期状态。
- `canUseD1` 探测（`server/lib/storage/d1.ts`，检查 `prepare` + `batch`）为每个 D1 存储做门槛判定：当 D1 不可用或尚未迁移时，三种高频存储（去重、投递状态、消息追踪）都会透明回退到 KV，迁移期间行为不变。
- 这让 Workers 免费版的每事件 KV 写入趋近于零（每日 1000 次写）：去重、投递状态和消息追踪改为写 D1 行（D1 免费版每日可写 10 万行）。
- R2 免费额度（10 GB-月存储、每月 100 万次 A 类操作）可以轻松承载负载暂存，不占用 KV 写配额。
