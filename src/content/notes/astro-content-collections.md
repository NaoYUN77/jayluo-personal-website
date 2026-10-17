---
title: Astro Content Collections 速记
description: 用 glob loader + Zod schema 管理博客和笔记的最小用法。
date: 2026-10-15
tags: ['astro', 'typescript']
type: snippet
status: ready
---

## 定义集合

```ts
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    status: z.enum(['in-progress', 'incomplete', 'ready', 'archived']).default('in-progress')
  })
})

export const collections = { notes }
```

## 查询

```ts
import { getCollection } from 'astro:content'

const notes = (await getCollection('notes'))
  .filter((entry) => !entry.data.draft)
  .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
```

## 好处

- frontmatter 类型安全
- 日期自动从字符串转成 `Date`
- 缺字段在构建时直接报错，而不是运行时悄悄变成 `undefined`
