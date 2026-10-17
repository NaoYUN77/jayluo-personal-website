# Project conventions

## Stack

- Astro 5 + TypeScript, content collections under `src/content/`
- UnoCSS + Astro Theme Pure
- npm for installs and scripts (`npm run dev`, `npm run build`, `npm run check`)
- Vercel adapter, `output: 'server'`; most pages set `export const prerender = true`

## Content model

Three independent collections, never merged into one post list:

- **Blog** (`src/content/blog/<slug>/post.mdx` + `post.en.mdx`): finished posts, chronological.
  English mirrors need `language: en` and `translationKey: '<slug>/post'`.
- **Notes** (`src/content/notes/<slug>.md` + `.en.md`): short, evolving notes with `type` and
  `status`. English mirrors need `translationKey: '<slug>'`.
- **Projects** (`src/data/projects.ts`): data-driven, grouped by `status`
  (`active` / `paused` / `archived`), with `zh` / `en` copy.

Schemas live in `src/content.config.ts`. If you add a required field, update the sample content
and both language mirrors.

## Bilingual navigation

- Menu items are defined in `src/site.config.ts` → `header.menu`.
- Labels live in `src/i18n/ui.ts` → `ui.zh` / `ui.en`, keyed as `nav.*`.
- `src/components/Header.astro` resolves the label via `useTranslations(lang)` and prefixes links
  with `/en` through `localizedPath`.
- The English menu filters items through `hasEnAlternate()`; add new English pages there when you
  add a nav item.
- Keep the two locale versions of a page in sync (`src/pages/...` and `src/pages/en/...`).

## Commands

```shell
npm run dev      # Astro dev server on :4321
npm run build    # production build, must pass before finishing a change
npm run check    # astro check (type + content validation)
npm run format   # prettier
```

## Rules

- Do not reintroduce upstream personal content (Joye's posts, projects, friend links, analytics
  endpoints, Waline server, Umami script).
- Placeholder personal data lives in `src/site.config.ts`, `src/data/projects.ts`, the about/contact
  pages, and the avatar/favicon files. Keep them clearly replaceable.
- Prefer content collections and Zod schemas over free-form strings.
- Run `npm run build` after structural changes; a passing build is the definition of done for v0.1.

## Known limitations (v0.1)

- Comments and page-view counters are disabled (`integ.waline.enable = false`).
- Curated / Talks / Lab collections still exist in the schema but have no pages or content.
- The Vercel adapter is kept for future server routes; static hosting needs a small config change.
