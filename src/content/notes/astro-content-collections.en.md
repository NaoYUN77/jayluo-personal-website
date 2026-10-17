---
title: Astro Content Collections Cheatsheet
description: The minimal glob loader + Zod schema setup for blogs and notes.
date: 2026-10-15
tags: ['astro', 'typescript']
type: snippet
status: ready
language: en
translationKey: 'astro-content-collections'
---

## Define a collection

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

## Query

```ts
import { getCollection } from 'astro:content'

const notes = (await getCollection('notes'))
  .filter((entry) => !entry.data.draft)
  .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
```

## Why it helps

- type-safe frontmatter
- strings coerced into `Date`
- missing fields fail the build instead of silently becoming `undefined`
