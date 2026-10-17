# Jayluo Blog Content API v1

本文档描述站点 `src/pages/api` 下的接口，包括面向 agent 的内容 CRUD API、R2 媒体接口，
以及站点自身使用的只读搜索接口。

- 本地地址：`http://localhost:4321/api/v1`
- 线上地址：`https://<你的域名>/api/v1`
- 数据源：博客和笔记写入 GitHub 仓库，项目写入 `src/data/projects.json`，媒体写入 R2
- 内容写入成功后可通过 `DEPLOY_HOOK_URL` 触发重新构建

## 目录

- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [鉴权](#鉴权)
- [通用约定](#通用约定)
- [接口总览](#接口总览)
- [健康检查](#健康检查)
- [博客](#博客)
- [笔记](#笔记)
- [项目](#项目)
- [媒体](#媒体)
- [头像](#头像)
- [站点只读接口](#站点只读接口)
- [错误码](#错误码)
- [本地验证清单](#本地验证清单)

## 快速开始

1. 复制 `.dev.vars.example` 为 `.dev.vars`。
2. 至少配置 `CONTENT_API_TOKEN`、`GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO`。
3. 启动开发服务器：

```shell
npm run dev
```

GitHub token 至少需要目标仓库的 **Contents: Read and write** 权限。`GITHUB_BRANCH`
控制写入分支，默认是 `main`。

如果不希望连接真实 GitHub 仓库，可以启动内存 mock：

```shell
npm run mock:github
```

把 `.dev.vars` 中的 `GITHUB_API_BASE_URL` 改成 `http://127.0.0.1:4330`，再执行完整 CRUD
冒烟测试：

```shell
npm run test:api
```

mock 只存在于内存，不会修改工作区文件。

## 环境变量

| 变量                  | 必填   | 说明                                                |
| --------------------- | ------ | --------------------------------------------------- |
| `CONTENT_API_TOKEN`   | 是     | 内容接口 Bearer token；未配置时受保护接口返回 `503` |
| `GITHUB_TOKEN`        | 是     | GitHub Contents API token                           |
| `GITHUB_OWNER`        | 是     | GitHub 用户名或组织名                               |
| `GITHUB_REPO`         | 是     | 内容仓库名                                          |
| `GITHUB_BRANCH`       | 否     | 写入分支，默认 `main`                               |
| `GITHUB_API_BASE_URL` | 否     | GitHub API 地址，默认 `https://api.github.com`      |
| `DEPLOY_HOOK_URL`     | 否     | 内容写入后异步 POST 的部署 hook                     |
| `MAX_MEDIA_BYTES`     | 否     | 普通媒体大小上限，默认 `20971520`（20 MB）          |
| `MAX_AVATAR_BYTES`    | 否     | 头像大小上限，默认 `5242880`（5 MB）                |
| `SITE_URL`            | 构建时 | 站点绝对地址，默认 `https://example.com`            |

Cloudflare 部署时应将 token 放在 Pages secret 或环境变量中，不要提交到仓库、写进 URL、
日志、前端代码或 agent 的公开配置。

## 鉴权

除以下公开接口外，所有 `/api/v1` 请求都需要携带：

```http
Authorization: Bearer <CONTENT_API_TOKEN>
```

公开接口：

- `GET /api/v1/health`
- `GET|HEAD /api/v1/avatar`
- `GET|HEAD /api/v1/media/{key}`

鉴权行为：

- 未配置 `CONTENT_API_TOKEN`：返回 `503 API_NOT_CONFIGURED`
- 缺少 token 或 token 错误：返回 `401 UNAUTHORIZED`
- 内容接口还要求 GitHub 配置完整；缺少时返回 `503 GITHUB_NOT_CONFIGURED`
- 媒体写入接口要求 R2 `MEDIA` binding；缺少时返回 `503 R2_NOT_CONFIGURED`

## 通用约定

### 请求格式

- JSON 接口使用 `Content-Type: application/json`
- 图片的 multipart 上传使用 `Content-Type: multipart/form-data`
- 图片原始上传直接发送二进制 body，服务端根据文件头识别格式
- JSON 内容请求上限通常为 1 MB，项目接口为 200 KB；Markdown `body` 上限为 800 KB

### 成功响应

单条数据：

```json
{
  "data": {}
}
```

列表数据：

```json
{
  "data": [],
  "meta": {
    "locale": "zh",
    "count": 0,
    "limit": 20,
    "offset": 0
  }
}
```

写操作还会在 `meta` 中返回 GitHub commit 和部署 hook 状态：

```json
{
  "meta": {
    "commit": "<commit sha>",
    "deployQueued": false
  }
}
```

`DELETE` 和部分媒体接口成功时返回 `204 No Content`，没有响应 body。

### 错误响应

```json
{
  "error": {
    "code": "INVALID_FIELD",
    "message": "title must be a string.",
    "details": {}
  }
}
```

`details` 可选，可能包含 GitHub 返回的诊断信息。完整错误码见[错误码](#错误码)。

### 语言

`locale` 仅接受 `zh` 或 `en`，默认 `zh`。写操作通过 query 参数决定操作中文文件还是英文
镜像：

```http
GET /api/v1/posts/my-post?locale=en
PATCH /api/v1/notes/my-note?locale=en
```

创建请求也可以在 JSON body 中传 `locale`。

### 分页与过滤

博客和笔记列表支持：

| 参数          | 默认值  | 范围/取值                    | 说明                       |
| ------------- | ------- | ---------------------------- | -------------------------- |
| `locale`      | `zh`    | `zh` / `en`                  | 内容语言                   |
| `limit`       | `20`    | 1–50                         | 返回条数                   |
| `offset`      | `0`     | 0–10000                      | 跳过条数                   |
| `draft`       | `all`   | 见下文                       | 草稿过滤                   |
| `includeBody` | `false` | `true` / `1` / `false` / `0` | 列表是否包含 Markdown 正文 |

`draft` 取值：

- `all`：草稿和已发布内容都返回
- `true` 或 `only`：只返回草稿
- `false` 或 `published`：只返回已发布内容

`limit`、`offset` 超出范围时会被截断到边界；无法解析为数字时使用默认值。列表的
`meta.count` 是本次返回条数，不是总数。当前实现按仓库路径倒序扫描最多
`max(limit, 100)` 个文件后再过滤和分页。

### ID、日期和版本

- `id` 使用小写字母、数字和连字符，最长 96 个字符；不能以连字符结尾或包含 `..`
- 日期使用 ISO 格式，例如 `2026-10-18` 或合法的时间戳字符串
- `version` 是 GitHub blob SHA，可用于比较本地缓存，但写入时不需要显式提交
- 并发写入由 GitHub blob SHA 保护；内容在读取后发生变化时返回 `409 CONTENT_CONFLICT`

### 部署 hook

配置 `DEPLOY_HOOK_URL` 后，成功的博客、笔记和项目 POST/PATCH/DELETE 会在后台发起一个
`POST` 请求。API 不等待 hook 完成，只通过 `meta.deployQueued` 表示是否已排入请求。
媒体和头像写入不会触发部署 hook。

## 接口总览

以下路径均相对于 `/api/v1`。

| 方法   | 路径             | 鉴权 | 说明                     |
| ------ | ---------------- | ---- | ------------------------ |
| GET    | `/health`        | 否   | 配置与能力检查           |
| GET    | `/posts`         | 是   | 博客列表                 |
| POST   | `/posts`         | 是   | 新建博客                 |
| GET    | `/posts/{id}`    | 是   | 读取博客                 |
| PATCH  | `/posts/{id}`    | 是   | 局部更新博客             |
| DELETE | `/posts/{id}`    | 是   | 删除博客                 |
| GET    | `/notes`         | 是   | 笔记列表                 |
| POST   | `/notes`         | 是   | 新建笔记                 |
| GET    | `/notes/{id}`    | 是   | 读取笔记                 |
| PATCH  | `/notes/{id}`    | 是   | 局部更新笔记             |
| DELETE | `/notes/{id}`    | 是   | 删除笔记                 |
| GET    | `/projects`      | 是   | 项目列表                 |
| POST   | `/projects`      | 是   | 新建项目                 |
| GET    | `/projects/{id}` | 是   | 读取项目                 |
| PATCH  | `/projects/{id}` | 是   | 局部更新项目             |
| DELETE | `/projects/{id}` | 是   | 删除项目                 |
| GET    | `/media`         | 是   | R2 媒体列表              |
| POST   | `/media`         | 是   | multipart 上传图片       |
| PUT    | `/media/{key}`   | 是   | 原始二进制上传/覆盖图片  |
| GET    | `/media/{key}`   | 否   | 公开读取图片             |
| HEAD   | `/media/{key}`   | 否   | 读取图片响应头           |
| DELETE | `/media/{key}`   | 是   | 删除图片                 |
| GET    | `/avatar`        | 否   | 读取头像或跳转到默认头像 |
| HEAD   | `/avatar`        | 否   | 读取头像响应头           |
| PUT    | `/avatar`        | 是   | 上传/替换头像            |
| DELETE | `/avatar`        | 是   | 删除头像                 |

## 健康检查

### `GET /health`

无需鉴权。用于检查内容 CRUD、R2 和部署 hook 是否可用。

```shell
curl "http://localhost:4321/api/v1/health"
```

```json
{
  "data": {
    "status": "ok",
    "version": "v1",
    "capabilities": {
      "contentCrud": true,
      "media": true,
      "deployHook": false
    }
  },
  "meta": {
    "time": "2026-10-18T00:00:00.000Z"
  }
}
```

能力字段：

- `contentCrud`：`CONTENT_API_TOKEN` 和 GitHub 配置是否完整
- `media`：是否存在 R2 `MEDIA` binding
- `deployHook`：是否配置 `DEPLOY_HOOK_URL`

即使能力为 `false`，health 接口本身仍返回 `200`。

## 博客

博客存储在：

```text
src/content/blog/{id}/post.md
src/content/blog/{id}/post.mdx
src/content/blog/{id}/post.en.md
src/content/blog/{id}/post.en.mdx
```

### `GET /posts`

返回博客列表。默认不返回正文。

```shell
curl "http://localhost:4321/api/v1/posts?locale=zh&limit=20&offset=0&draft=published" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

响应：

```json
{
  "data": [
    {
      "type": "post",
      "id": "20261017---hello-world",
      "locale": "zh",
      "path": "src/content/blog/20261017---hello-world/post.mdx",
      "version": "<blob sha>",
      "url": "/blog/20261017---hello-world/post",
      "title": "Hello World",
      "description": "First post.",
      "publishDate": "2026-10-17",
      "tags": ["hello"],
      "draft": false,
      "comment": true
    }
  ],
  "meta": {
    "locale": "zh",
    "count": 1,
    "limit": 20,
    "offset": 0
  }
}
```

设置 `includeBody=true` 可在每条记录中返回 `body`。列表按发布日期倒序排列。

### `GET /posts/{id}`

读取单篇博客，默认包含正文。

```shell
curl "http://localhost:4321/api/v1/posts/20261017---hello-world?locale=zh" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

可传 `includeBody=false` 只读取元数据。响应中的 `data` 是单条 Post Record。

### `POST /posts`

创建博客。成功返回 `201 Created` 和 `Location` header。

```shell
curl -X POST "http://localhost:4321/api/v1/posts" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "20261018-local-api",
    "locale": "zh",
    "title": "本地 API",
    "description": "通过 CRUD 接口创建。",
    "publishDate": "2026-10-18",
    "tags": ["api", "agent"],
    "body": "## Hello\n\n正文由 agent 写入。",
    "format": "md"
  }'
```

字段：

| 字段             | 类型         | 创建 | 更新   | 说明                                      |
| ---------------- | ------------ | ---- | ------ | ----------------------------------------- |
| `id`             | string       | 必填 | 不可改 | 小写 slug，最长 96                        |
| `locale`         | `zh`/`en`    | 可选 | query  | 默认 `zh`                                 |
| `title`          | string       | 必填 | 可选   | 最长 60 字符                              |
| `description`    | string       | 必填 | 可选   | 最长 160 字符                             |
| `publishDate`    | ISO date     | 必填 | 可选   | 发布日期                                  |
| `updatedDate`    | ISO date     | 可选 | 可选   | 更新日期                                  |
| `body`           | string       | 可选 | 可选   | 默认空字符串，最大 800 KB                 |
| `format`         | `md`/`mdx`   | 可选 | 忽略   | 默认 `mdx`，只影响新建文件名              |
| `tags`           | string[]     | 可选 | 可选   | 最多 20 项，每项最长 40；自动去重并转小写 |
| `draft`          | boolean      | 可选 | 可选   | 默认 `false`                              |
| `language`       | string       | 可选 | 可选   | 英文镜像创建时自动为 `en`                 |
| `translationKey` | string       | 可选 | 可选   | 英文镜像创建时默认 `{id}/post`            |
| `ogImage`        | absolute URL | 可选 | 可选   | 绝对 HTTP(S) URL                          |
| `tocDepth`       | integer      | 可选 | 可选   | 2–6                                       |
| `tocLabels`      | object       | 可选 | 可选   | 原样写入 YAML                             |
| `comment`        | boolean      | 可选 | 可选   | 默认 `true`                               |
| `heroImage`      | object       | 可选 | 可选   | 原样写入 YAML                             |

PATCH 使用局部更新，只修改传入字段。`updatedDate`、`language`、`translationKey`、
`ogImage`、`tocDepth`、`tocLabels`、`heroImage` 可通过传 `null` 删除；`tags`、
`draft`、`comment` 等字段需要传入对应类型。`id`、`locale`、`format` 不参与更新。

英文镜像会自动补：

```yaml
language: en
translationKey: <id>/post
```

显式传入的值优先。Post Record 的 URL 为：

- 中文：`/blog/{id}/post`
- 英文：`/en/blog/{translationKey}`，未配置时回退到 `{id}/post`

`heroImage` 应满足站点 content schema，常见结构如下：

```json
{
  "src": "./cover.png",
  "alt": "Cover",
  "inferSize": true,
  "width": 1200,
  "height": 630,
  "color": "#ffffff"
}
```

### `PATCH /posts/{id}`

```shell
curl -X PATCH "http://localhost:4321/api/v1/posts/20261018-local-api?locale=zh" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新后的标题",
    "draft": true,
    "updatedDate": "2026-10-19"
  }'
```

成功时返回更新后的完整 `data`，以及 commit/deploy meta。

### `DELETE /posts/{id}`

```shell
curl -X DELETE "http://localhost:4321/api/v1/posts/20261018-local-api?locale=zh" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

成功返回 `204 No Content`。目标不存在时返回 `404 NOT_FOUND`。

## 笔记

笔记存储在：

```text
src/content/notes/{id}.md
src/content/notes/{id}.mdx
src/content/notes/{id}.en.md
src/content/notes/{id}.en.mdx
```

### `GET /notes`

查询参数与博客列表一致。

```shell
curl "http://localhost:4321/api/v1/notes?locale=zh&limit=20&offset=0" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

列表响应中的 Note Record 示例：

```json
{
  "type": "note",
  "id": "hello-note",
  "locale": "zh",
  "path": "src/content/notes/hello-note.md",
  "version": "<blob sha>",
  "url": "/notes/hello-note",
  "title": "Hello Note",
  "date": "2026-10-17",
  "tags": ["hello"],
  "draft": false
}
```

当前实现会把笔记 frontmatter 的 `type`（例如 `snippet`）展开到记录顶层，因此响应中的
`type` 可能与记录种类 `note` 不同。读取时应以 `path`、`url` 和正文内容识别资源。

### `GET /notes/{id}`

默认返回正文；可传 `includeBody=false`。

```shell
curl "http://localhost:4321/api/v1/notes/hello-note?locale=zh" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

### `POST /notes`

```shell
curl -X POST "http://localhost:4321/api/v1/notes" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "agent-note",
    "locale": "zh",
    "title": "Agent note",
    "date": "2026-10-18",
    "status": "ready",
    "type": "note",
    "tags": ["agent"],
    "body": "笔记正文。"
  }'
```

字段：

| 字段             | 类型         | 创建 | 更新   | 说明                                      |
| ---------------- | ------------ | ---- | ------ | ----------------------------------------- |
| `id`             | string       | 必填 | 不可改 | 小写 slug，最长 96                        |
| `locale`         | `zh`/`en`    | 可选 | query  | 默认 `zh`                                 |
| `title`          | string       | 必填 | 可选   | 最长 120 字符                             |
| `date`           | ISO date     | 必填 | 可选   | 笔记日期                                  |
| `description`    | string       | 可选 | 可选   | 最长 300 字符                             |
| `updatedDate`    | ISO date     | 可选 | 可选   | 更新日期                                  |
| `body`           | string       | 可选 | 可选   | 默认空字符串，最大 800 KB                 |
| `format`         | `md`/`mdx`   | 可选 | 忽略   | 默认 `md`                                 |
| `tags`           | string[]     | 可选 | 可选   | 最多 20 项，每项最长 40；自动去重并转小写 |
| `type`           | enum         | 可选 | 可选   | 默认 `note`                               |
| `status`         | enum         | 可选 | 可选   | 默认 `in-progress`                        |
| `draft`          | boolean      | 可选 | 可选   | 默认 `false`                              |
| `language`       | string       | 可选 | 可选   | 英文镜像创建时自动为 `en`                 |
| `translationKey` | string       | 可选 | 可选   | 英文镜像创建时默认 `{id}`                 |
| `relatedBlog`    | string[]     | 可选 | 可选   | 最多 20 项，自动转小写                    |
| `relatedNote`    | string[]     | 可选 | 可选   | 最多 20 项，自动转小写                    |
| `source`         | absolute URL | 可选 | 可选   | 外部来源链接                              |

`type` 可选值：

```text
note | snippet | draft | idea | research | reference
```

`status` 可选值：

```text
in-progress | incomplete | ready | archived
```

PATCH 语义与博客相同。`updatedDate`、`description`、`language`、`translationKey`、
`relatedBlog`、`relatedNote`、`source` 可以通过传 `null` 删除。

英文镜像会自动补：

```yaml
language: en
translationKey: <id>
```

Note Record 的 URL 为：

- 中文：`/notes/{id}`
- 英文：`/en/notes/{translationKey}`，未配置时回退到 `{id}`

### `PATCH /notes/{id}`

```shell
curl -X PATCH "http://localhost:4321/api/v1/notes/agent-note?locale=zh" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"archived","body":"已归档。"}'
```

### `DELETE /notes/{id}`

成功返回 `204 No Content`。

## 项目

项目数据源是 `src/data/projects.json`。每次写入都会对整个 JSON 数组做一次提交，
因此所有项目共享同一个 `version`（文件 blob SHA）。

### `GET /projects`

```shell
curl "http://localhost:4321/api/v1/projects" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

```json
{
  "data": [
    {
      "type": "project",
      "path": "src/data/projects.json",
      "version": "<blob sha>",
      "id": "agent-runner",
      "name": "Agent Runner",
      "status": "active",
      "stack": ["typescript", "cloudflare"],
      "repo": "https://github.com/example/agent-runner",
      "featured": true,
      "zh": { "description": "中文说明" },
      "en": { "description": "English description" }
    }
  ],
  "meta": {
    "count": 1
  }
}
```

### `GET /projects/{id}`

返回单个项目。

### `POST /projects`

```shell
curl -X POST "http://localhost:4321/api/v1/projects" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "agent-runner",
    "name": "Agent Runner",
    "status": "active",
    "stack": ["TypeScript", "Cloudflare"],
    "repo": "https://github.com/example/agent-runner",
    "featured": true,
    "zh": { "description": "中文说明" },
    "en": { "description": "English description" }
  }'
```

字段：

| 字段             | 类型                         | 创建 | 说明                                      |
| ---------------- | ---------------------------- | ---- | ----------------------------------------- |
| `id`             | string                       | 必填 | 小写 slug，创建后不可修改                 |
| `name`           | string                       | 必填 | 最长 100 字符                             |
| `status`         | `active`/`paused`/`archived` | 必填 | 项目状态                                  |
| `stack`          | string[]                     | 必填 | 创建时至少 1 项；最多 20 项；转小写并去重 |
| `repo`           | absolute URL                 | 可选 | 仓库地址                                  |
| `demo`           | absolute URL                 | 可选 | 演示地址                                  |
| `featured`       | boolean                      | 可选 | 是否显示在首页                            |
| `image`          | string                       | 可选 | 最长 200 字符，不强制为 URL               |
| `zh.description` | string                       | 必填 | 中文说明，最长 500 字符                   |
| `en.description` | string                       | 必填 | 英文说明，最长 500 字符                   |

成功返回 `201 Created` 和 `Location` header。

### `PATCH /projects/{id}`

局部更新。`id` 不可修改，传入不同的 id 会返回 `400 IMMUTABLE_ID`。

```shell
curl -X PATCH "http://localhost:4321/api/v1/projects/agent-runner" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"paused","featured":false}'
```

`repo`、`demo`、`image` 可通过传 `null` 清除。

### `DELETE /projects/{id}`

删除项目。成功返回 `204 No Content`。删除最后一个项目时，JSON 文件会写成 `[]`。

## 媒体

媒体存储在 R2 的 `media/` 前缀下。服务端根据文件头识别真实格式，只接受：

```text
PNG | JPEG | GIF | WebP | AVIF
```

不接受 SVG、HTML 或其他任意文件。普通媒体默认上限 20 MB，可通过
`MAX_MEDIA_BYTES` 调整。

### 媒体 key 规则

- 必须以 `media/` 开头
- 只能包含字母、数字、`.`、`_`、`/`、`-`
- 不能包含反斜杠、连续斜杠、`.` 或 `..` 路径段
- 最长 200 字符
- 不能使用保留的 `profile/` 前缀

上传成功后的 `url` 可以直接放进 Markdown：

```markdown
![cover](/api/v1/media/media/2026/10/cover.png)
```

### `GET /media`

列出 R2 对象。需要鉴权。

| 参数     | 默认值   | 说明                           |
| -------- | -------- | ------------------------------ |
| `prefix` | `media/` | 必须位于 `media/` 下的安全路径 |
| `limit`  | `50`     | 1–100                          |
| `cursor` | 无       | 上一次响应返回的 R2 cursor     |

```shell
curl "http://localhost:4321/api/v1/media?prefix=media/2026/&limit=50" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN"
```

```json
{
  "data": [
    {
      "key": "media/2026/10/cover.png",
      "url": "http://localhost:4321/api/v1/media/media/2026/10/cover.png",
      "size": 12345,
      "contentType": "image/png",
      "version": "\"<etag>\"",
      "uploadedAt": "2026-10-18T00:00:00.000Z"
    }
  ],
  "meta": {
    "prefix": "media/2026/",
    "count": 1,
    "truncated": false,
    "cursor": null
  }
}
```

`truncated=true` 时，把 `meta.cursor` 作为下一次请求的 `cursor`。

### `POST /media`

multipart 上传。返回 `201 Created` 和 `Location` header。

```shell
curl -X POST "http://localhost:4321/api/v1/media" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -F "file=@cover.png"
```

form 字段：

| 字段    | 必填   | 说明                               |
| ------- | ------ | ---------------------------------- |
| `file`  | 二选一 | 图片文件；也可以使用字段名 `image` |
| `image` | 二选一 | `file` 的兼容字段名                |
| `key`   | 否     | 自定义媒体 key；不传时自动生成     |

自动生成的 key 形如：

```text
media/2026/10/1760000000000-a1b2c3d4-cover.png
```

### `PUT /media/{key}`

直接上传原始二进制，用于指定 key 和覆盖已有对象。

```shell
curl -X PUT "http://localhost:4321/api/v1/media/media/2026/10/cover.png" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary "@cover.png"
```

虽然示例带有 `Content-Type`，服务端最终以文件头识别结果为准。

### `GET|HEAD /media/{key}`

公开读取图片，无需鉴权。响应带 `ETag`、`Content-Length`、`Content-Type` 和
`X-Content-Type-Options: nosniff`。支持 `If-None-Match`，匹配时返回 `304`。

### `DELETE /media/{key}`

删除媒体，成功返回 `204 No Content`。删除不存在的 key 也返回 `204`。

## 头像

头像固定存储在 R2：

```text
profile/avatar
```

### `GET|HEAD /avatar`

公开读取头像，无需鉴权。头像存在时返回图片；不存在时 `302` 跳转到
`/avatar-fallback.png`。支持 `If-None-Match`。

### `PUT /avatar`

上传或替换头像。请求体是原始图片，默认上限 5 MB。

```shell
curl -X PUT "http://localhost:4321/api/v1/avatar" \
  -H "Authorization: Bearer $CONTENT_API_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary "@avatar.png"
```

成功返回：

```json
{
  "data": {
    "url": "http://localhost:4321/api/v1/avatar",
    "key": "profile/avatar",
    "size": 12345,
    "contentType": "image/png",
    "version": "\"<etag>\"",
    "uploadedAt": "2026-10-18T00:00:00.000Z"
  },
  "meta": {
    "deployQueued": false
  }
}
```

### `DELETE /avatar`

删除头像，成功返回 `204 No Content`。之后的 GET 会回退到默认头像。

## 站点只读接口

这些接口不在 `/api/v1` 下，面向站点自己的搜索和调试界面。它们不需要
`CONTENT_API_TOKEN`，响应可能随前端实现调整。

### `GET /api/search.json`

搜索已发布的博客和笔记。

| 参数    | 默认值 | 说明                              |
| ------- | ------ | --------------------------------- |
| `q`     | 空     | 搜索词；少于 2 个字符时返回空结果 |
| `limit` | `10`   | 1–20                              |
| `lang`  | `zh`   | `zh` 或 `en`                      |

```shell
curl "http://localhost:4321/api/search.json?q=agent&limit=10&lang=zh"
```

```json
{
  "query": "agent",
  "results": [
    {
      "collection": "blog",
      "title": "Agent note",
      "description": "Summary",
      "url": "/blog/20261018-agent-note/post",
      "date": "2026-10-18",
      "tags": ["agent"],
      "excerpt": "...",
      "score": 42
    }
  ]
}
```

多个以空格分隔的搜索词需要全部命中；结果按相关度和日期排序。英文索引只包含配置了
`translationKey` 且未标记为草稿的英文镜像。

### `GET /api/blog/{entryId}`

把博客 Markdown/MDX 渲染成 HTML，供终端或文章预览器使用。`entryId` 是 Astro content
entry id，例如 `20261017---hello-world/post`。

```shell
curl "http://localhost:4321/api/blog/20261017---hello-world/post"
```

```json
{
  "html": "<h2>Hello</h2>...",
  "headings": [
    {
      "depth": 2,
      "slug": "hello",
      "text": "Hello"
    }
  ]
}
```

不存在时返回纯文本 `404 Not found`。

## 错误码

| HTTP | code                      | 场景                                    |
| ---- | ------------------------- | --------------------------------------- |
| 400  | `INVALID_JSON`            | 请求 body 不是 JSON 对象                |
| 400  | `EMPTY_BODY`              | 需要 body 但请求为空                    |
| 400  | `INVALID_FIELD`           | 字段类型、长度、枚举或格式不合法        |
| 400  | `INVALID_ID`              | id 为空、URL 解码失败或不符合 slug 规则 |
| 400  | `MISSING_ID`              | 路由缺少 id                             |
| 400  | `INVALID_LOCALE`          | locale 不是 `zh` / `en`                 |
| 400  | `INVALID_DRAFT_FILTER`    | draft 参数不合法                        |
| 400  | `INVALID_MEDIA_KEY`       | 媒体 key 或 prefix 不安全               |
| 400  | `MISSING_FILE`            | multipart 请求缺少文件                  |
| 400  | `MISSING_MEDIA_KEY`       | 媒体路由缺少 key                        |
| 400  | `INVALID_MULTIPART`       | multipart 无法解析                      |
| 401  | `UNAUTHORIZED`            | Bearer token 缺失或错误                 |
| 404  | `NOT_FOUND`               | 内容、项目或媒体不存在                  |
| 404  | `GITHUB_NOT_FOUND`        | GitHub 仓库、分支或文件不存在           |
| 409  | `ALREADY_EXISTS`          | 创建了同 id 的博客、笔记或项目          |
| 409  | `CONTENT_CONFLICT`        | 写入期间 GitHub 内容已被其他请求修改    |
| 409  | `IMMUTABLE_ID`            | 尝试修改项目 id                         |
| 413  | `PAYLOAD_TOO_LARGE`       | JSON、Markdown body 或图片超过限制      |
| 415  | `MULTIPART_REQUIRED`      | `POST /media` 未使用 multipart          |
| 415  | `UNSUPPORTED_MEDIA_TYPE`  | 图片不是允许的格式                      |
| 422  | `INVALID_FRONTMATTER`     | 读取到的 Markdown frontmatter 损坏      |
| 500  | `INTERNAL_ERROR`          | 未处理的异常                            |
| 500  | `PROJECTS_FILE_MISSING`   | GitHub 分支缺少 `projects.json`         |
| 500  | `CONTENT_CORRUPT`         | `projects.json` 不是合法的项目数组      |
| 502  | `GITHUB_UNAVAILABLE`      | 无法连接 GitHub API                     |
| 502  | `GITHUB_AUTH_FAILED`      | GitHub token 被拒绝或权限不足           |
| 502  | `GITHUB_INVALID_RESPONSE` | GitHub 返回了无法识别的数据             |
| 502  | `GITHUB_TREE_TRUNCATED`   | 仓库文件树太大，GitHub 拒绝完整返回     |
| 502  | `GITHUB_REQUEST_FAILED`   | GitHub 返回其他非成功状态               |
| 503  | `API_NOT_CONFIGURED`      | 未配置 `CONTENT_API_TOKEN`              |
| 503  | `GITHUB_NOT_CONFIGURED`   | GitHub 配置缺失或无效                   |
| 503  | `R2_NOT_CONFIGURED`       | 缺少 `MEDIA` R2 binding                 |
| 503  | `GITHUB_RATE_LIMITED`     | GitHub API 触发限流                     |

## 本地验证清单

1. `npm run dev` 能启动，`GET /api/v1/health` 返回 `200`。
2. 不带 token 请求 `/api/v1/posts` 返回 `401`。
3. 启动 GitHub mock 后运行 `npm run test:api`，确认博客、笔记、项目、媒体和头像的
   CRUD 全部通过。
4. 写入内容后检查 GitHub commit 和站点构建；媒体上传后直接访问返回的 `url`。
5. 删除测试内容，确认不会留下临时文件和 R2 对象。
