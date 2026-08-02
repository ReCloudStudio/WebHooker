# 过滤器教程

过滤器决定哪些 Webhook 事件会被[路由](./configuration#路由)转发。只有当路由 `filters` 数组中的**每一个**过滤器都匹配时，路由才会触发（AND 逻辑）。本页是一份上手教程：解释每种过滤器类型的行为，以及如何组合它们实现真实场景的路由规则。

参考表格见配置指南的[过滤器类型](./configuration#过滤器类型)，完整事件列表见[支持的事件](../events/supported)。

## 匹配机制

- 路由中所有过滤器都必须匹配，否则该路由被跳过。
- 每个过滤器将事件与 Webhook 载荷的某个字段进行匹配。
- 匹配**不区分大小写且为精确匹配**：`main` 能匹配 `main`、`Main`、`MAIN`，但不能匹配 `main-v2`。
- `match` 值可以是单个字符串，也可以是字符串数组。数组相当于 OR——只要其中一个值匹配，该过滤器即匹配。
- 设置 `"exclude": true` 会反转结果（NOT 逻辑）：当值**不**等于 match 值时，该过滤器才匹配。

```json
{
  "type": "event",
  "match": ["push", "pull_request"],
  "exclude": false
}
```

上面这条路由同时匹配 `push` 和 `pull_request` 事件。

## 各过滤器类型详解

### `event` — 事件类型

匹配 GitHub 事件名称，如 `push`、`pull_request`、`issues`、`release`。它是每条路由的主干。

```json
{ "type": "event", "match": "release" }
```

用数组匹配多种事件：

```json
{ "type": "event", "match": ["create", "delete"] }
```

### `repo` — 仓库

匹配仓库**全名**（`owner/name`）。不区分大小写。

```json
{ "type": "repo", "match": "myorg/backend" }
```

将多个仓库路由到同一频道：

```json
{ "type": "repo", "match": ["myorg/backend", "myorg/frontend"] }
```

### `actor` — 发送者

匹配触发事件的 **GitHub 发送者登录名**（载荷中的 `sender.login`）。常用于忽略机器人。

```json
{ "type": "actor", "match": "dependabot[bot]", "exclude": true }
```

上面这条路由对**除** Dependabot 触发之外的所有事件都会触发。

### `action` — 事件操作

匹配载荷中的 `action` 字段，如 `opened`、`closed`、`published`、`completed`。并非所有事件都带有 action——参见[过滤器兼容性](../events/supported#过滤器兼容性)。与 `event` 组合可精确到某个生命周期步骤：

```json
{
  "type": "event",
  "match": "pull_request",
  "exclude": false
},
{
  "type": "action",
  "match": ["opened", "reopened"]
}
```

上面的规则在拉取请求被打开或重新打开时触发（合并/关闭/编辑时不触发）。

### `branch` — 分支

匹配事件涉及的分支。何种字段算作「分支」取决于事件类型：

| 事件                        | 提取的分支                     |
| --------------------------- | ------------------------------ |
| `push`                      | 推送到的目标分支               |
| `pull_request`（及 review） | 拉取请求的 **head**（源）分支  |
| `create` / `delete`         | 创建/删除的分支或标签          |
| `workflow_run`              | 工作流运行所在的 `head_branch` |
| `code_scanning_alert`       | 告警所属的分支                 |

```json
{
  "type": "event",
  "match": "push"
},
{
  "type": "branch",
  "match": "main"
}
```

仅当推送到 `main` 时触发。要关注多个长期分支：

```json
{ "type": "branch", "match": ["main", "develop"] }
```

> [!NOTE]
> `branch` 匹配是**精确且不区分大小写**的，不是通配符或前缀匹配。`feature/*` 这样的值**不会**生效。需要前缀或通配符式匹配时，请改用 `keyword` 过滤器匹配载荷（见下）。

### `keyword` — 载荷中的文本

匹配整个 JSON 载荷（转为小写）。它支持正则表达式，因此是最灵活的过滤器。模式以 `i`（忽略大小写）标志编译。

```json
{ "type": "keyword", "match": "/deploy/started/i" }
```

当载荷中任意位置包含 `deploy/started` 时触发。由于载荷已被转为小写，`i` 标志可有可无但无副作用。

一些实用示例：

```json
{ "type": "keyword", "match": "/dependabot/" }
```

```json
{ "type": "keyword", "match": "/^(fix|hotfix)/" }
```

```json
{ "type": "keyword", "match": "/release-[0-9]+/" }
```

行为细节：

- 超过 200 个字符的模式**不**编译为正则，回退为纯子串匹配。
- 如果某模式不是合法正则，也会回退为子串匹配，而不是报错。
- 要搜索是正则特殊字符的文本（如 `v1.2.3`），可以省略正则语法直接依赖子串回退——不含正则元字符的模式两种方式行为相同。
- 搜索覆盖**整个**载荷：提交信息、PR 标题与正文、标签、引用，甚至仓库名和发送者名。

### `keyword` 与 `exclude` 组合

与其他过滤器一样，`exclude` 会反转关键词匹配：

```json
{ "type": "keyword", "match": "/wip|draft/", "exclude": true }
```

跳过载荷中提及 `wip` 或 `draft` 的事件。

## 示例 1：PR 通知，跳过机器人和草稿

转发拉取请求动态，但忽略机器人作者和草稿 PR，发往 `#prs` 频道：

```json
{
  "id": "pr-notices",
  "name": "PR Notices",
  "enabled": true,
  "groupId": "eng",
  "filters": [
    { "type": "event", "match": "pull_request" },
    { "type": "actor", "match": "dependabot[bot]", "exclude": true },
    { "type": "keyword", "match": "\"draft\": true", "exclude": true }
  ],
  "target": { "channelId": "111111111111111111" }
}
```

`"draft": true` 模式匹配 GitHub 在拉取请求载荷中包含的 `draft` 字段；配合 `exclude: true` 即可过滤掉草稿 PR。

## 示例 2：仅发布通知频道

只转发特定仓库的已发布 release：

```json
{
  "id": "release-alerts",
  "name": "Release Alerts",
  "enabled": true,
  "groupId": "eng",
  "filters": [
    { "type": "event", "match": "release" },
    { "type": "action", "match": "published" },
    { "type": "repo", "match": "myorg/backend" }
  ],
  "target": { "channelId": "222222222222222222" }
}
```

## 示例 3：CI 失败

转发任意分支上以失败结束的 workflow run，发往 `#ci` 频道：

```json
{
  "id": "ci-failures",
  "name": "CI Failures",
  "enabled": true,
  "groupId": "eng",
  "filters": [
    { "type": "event", "match": "workflow_run" },
    { "type": "action", "match": "completed" },
    { "type": "keyword", "match": "\"conclusion\":\"failure\"" }
  ],
  "target": { "channelId": "333333333333333333" }
}
```

## 常见陷阱

- **非 keyword 过滤器不支持通配符。** `event`、`repo`、`actor`、`action`、`branch` 都是精确匹配。`repo: "myorg/*"` 不会匹配任何内容。
- **`action` 过滤器遇到无 action 的事件永远不匹配。** 先确认该事件带有 `action` 字段（见[过滤器兼容性](../events/supported#过滤器兼容性)）。
- **`branch` 过滤器遇到无分支的事件永远不匹配。** 在 `issues` 事件上使用 `branch` 过滤器恒为假。此时需要类似分支的匹配可用 `keyword`。
- **`keyword` 会搜索一切。** 因为它扫描整个载荷，`"fix"` 这样的模式可能同时匹配提交信息、issue 标题和仓库名。请尽量写得更具体。
- **牢记 `exclude` 语义。** `exclude: true` 反转的是整个过滤器——数组中的一个值不匹配并不会「阻断」路由；只有当**所有**值都不匹配时，取反后的过滤器才匹配。
