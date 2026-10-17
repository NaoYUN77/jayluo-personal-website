# Jayluo blog (v0.1)

一个把 **博客 / 笔记 / 项目** 放在同一个站里的个人网站，基于
[Astro](https://astro.build/) 和 [Astro Theme Pure](https://astro-pure.js.org/) 二次开发。

- 中文在根路径，英文在 `/en` 下
- 导航栏随语言切换：中文页显示「博客 / 笔记 / 项目 / 关于 / 联系」，英文页显示对应英文
- 三类内容各自独立：博客按时间发布，笔记按状态和标签生长，项目按状态归档

## 技术栈

- Astro 5 + TypeScript + Content Collections
- UnoCSS + Astro Theme Pure
- React islands（少量交互组件）
- Cloudflare Pages adapter（`output: 'server'`，大部分页面仍是预渲染）
- npm 管理依赖；也可以用 Bun

## 快速开始

```shell
npm install
npm run dev        # http://localhost:4321
npm run build      # 生产构建
npm run preview    # 用 Wrangler 预览上一次构建
npm run test:api   # 本地 API CRUD 冒烟测试
```

需要 Node.js 22。本地 API 使用 `.dev.vars` 读取 GitHub token 和测试 API token；
模板见 `.dev.vars.example`。

## 内容结构

```text
src/
  content/
    blog/
      20261017---hello-world/
        post.mdx          # 中文原文
        post.en.mdx       # 英文镜像（可选）
    notes/
      hello-note.md       # 中文笔记
      hello-note.en.md    # 英文镜像（可选）
  data/
    projects.json         # 项目数据源
    projects.ts           # 类型与读取辅助函数
  pages/
    blog/  notes/  projects/  about/  contact/
    en/                   # 英文路由
  site.config.ts          # 站点标题、作者、导航、社交链接
  i18n/ui.ts              # 导航文案与语言工具
```

### 新增博客

创建 `src/content/blog/<slug>/post.mdx`：

```yaml
---
title: 标题
description: 一句话摘要（最多 160 字）
publishDate: 2026-10-17
tags: ['标签']
---
```

英文镜像放在同目录的 `post.en.mdx`，并添加：

```yaml
language: en
translationKey: '<slug>/post'
```

### 新增笔记

创建 `src/content/notes/<slug>.md`：

```yaml
---
title: 标题
description: 一句话摘要
date: 2026-10-17
tags: ['标签']
type: note        # note | snippet | draft | idea | research | reference
status: ready     # in-progress | incomplete | ready | archived
---
```

英文镜像为 `<slug>.en.md`，并添加 `language: en` 和 `translationKey: '<slug>'`。

### 新增项目

项目 API 和页面共用 `src/data/projects.json`。每条记录包含：

- `status`: `active` / `paused` / `archived`
- `stack`: 技术栈字符串数组
- `repo` / `demo`: 可选链接
- `featured`: 是否显示在首页
- `zh` / `en`: 两种语言的描述

## 需要替换的占位内容

- `src/site.config.ts`：站点标题、作者名、描述、GitHub 链接
- `src/assets/avatar.png`：未上传 R2 头像时使用的默认头像
- `public/favicon/*`：站点图标
- `public/images/social-card.png`：默认分享卡片
- `src/pages/about/index.astro`、`src/pages/contact/index.astro` 及英文版：个人介绍和联系方式
- `src/data/projects.json`：示例项目
- 构建环境变量 `SITE_URL`：换成正式域名
- `src/content/blog`、`src/content/notes`：示例内容

## 双语导航

导航项在 `src/site.config.ts` 的 `header.menu` 中定义，文案在 `src/i18n/ui.ts` 的
`nav.*` 里维护；`Header.astro` 会根据当前语言选择文案并把链接加上 `/en` 前缀。
英文站只展示存在英文镜像的菜单项。

## 部署

本地调试 API：

```shell
npm run dev
```

运行 `npm run test:api` 前先启动 `npm run mock:github`，并把 `.dev.vars` 中的
`GITHUB_API_BASE_URL` 指向 `http://127.0.0.1:4330`。测试只操作内存数据。

内容 CRUD、R2 媒体与头像、鉴权和 curl 示例见 `docs/API.md`。

Cloudflare 部署尚未执行。`wrangler.jsonc` 已声明 Pages 输出目录和 `MEDIA` R2
binding；部署前还需要创建 R2 bucket、配置 GitHub token 和 `CONTENT_API_TOKEN`。
