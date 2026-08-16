# Admin API

管理端点用于管理路由、分组、成员、邀请、webhook 密钥、发送日志与审计日志。它们需要会话 Cookie，可通过 `GET /admin/login`（GitHub OAuth）获取；登录用户必须列在 `ADMIN_USER_IDS` 中，或管理某个分组。设置方法见[配置 → Web 控制台](../guide/configuration.md#web-ui)。

控制台本身在 `/admin` 提供；其标签页可通过 URL 路径直达（`/admin/groups`、`/admin/logs`、`/admin/audit`）。

## 端点

| 端点                                            | 说明                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /admin`                                    | 配置控制台页面                                                                       |
| `GET /admin/login`                              | 开始管理员登录（GitHub OAuth）                                                       |
| `GET /admin/logout`                             | 退出登录并销毁会话                                                                   |
| `GET /admin/invite?token=…`                     | 接受分组邀请（浏览器页面）                                                           |
| `GET /admin/api/me`                             | 当前会话、权限范围、分组与角色                                                       |
| `GET /admin/api/routes`                         | 列出路由（按权限过滤）                                                               |
| `PUT /admin/api/routes`                         | 替换路由（按分组 owner/admin）                                                       |
| `GET /admin/api/groups`                         | 列出分组 + 当前用户在各分组的角色                                                    |
| `PUT /admin/api/groups`                         | 替换分组（超级管理员全部；owner 仅自己的）                                           |
| `GET /admin/api/groups/:id/routes`              | 列出某分组的路由                                                                     |
| `PUT /admin/api/groups/:id/routes`              | 替换某分组的路由（owner/admin）                                                      |
| `PUT /admin/api/groups/:id/rename`              | 重命名分组（owner）；路由、webhook secret 与邀请自动跟随                             |
| `GET /admin/api/groups/:id/invites`             | 列出待处理的邀请（owner）                                                            |
| `POST /admin/api/groups/:id/invites`            | 创建邀请链接（owner）                                                                |
| `DELETE /admin/api/invites/:token`              | 撤销邀请（owner）                                                                    |
| `GET /admin/api/groups/:id/webhook`             | 分组 webhook 端点信息（owner）                                                       |
| `POST /admin/api/groups/:id/webhook/regenerate` | 生成/重新生成分组 webhook secret（owner）                                            |
| `DELETE /admin/api/groups/:id/webhook`          | 停用分组 webhook 入口（owner）                                                       |
| `GET /admin/api/logs`                           | 发送日志（按可访问的路由过滤）                                                       |
| `GET /admin/api/logs/:id`                       | 单条发送日志（按权限过滤）                                                           |
| `GET /admin/api/audit`                          | 审计日志（按可访问的分组过滤）                                                       |
| `GET /admin/api/metrics`                        | 投递统计（总计、失败率、按平台/事件/状态、最近失败）；可选 `?groupId=` 按分组过滤；非超管按可访问分组过滤最近失败 |
| `GET /admin/api/delivery/:deliveryId`           | 单次投递的全部发送日志（按分组过滤）                                                 |

## 校验

- `PUT /admin/api/routes` — 请求体为 `{ "routes": Route[] }`；校验每条路由（id 格式、组内唯一 id、name、enabled、groupId、过滤器——**仅 `fallback` 路由允许空过滤器**——可选的 `discordRoleIds`（身份组 id 字符串列表）、平台感知的 targets：Discord 需 `target.channelId`，Telegram 需 `target.chatId`）并持久化到 KV `config:routes`。返回 `200 { ok, count }` 或 `400 { error }` / `401 { error }` / `403 { error }`。未变更的路由跳过完整校验。
- `PUT /admin/api/groups` — 校验分组 id、成员角色（至少一个 `owner`）、`providers`（`github` / `gitea`）与 `installationId`。
- 上限：每个实例最多 200 条路由与 100 个分组。

模式：见[路由与目标](../guide/routes)、[分组与访问控制](../guide/groups)。
