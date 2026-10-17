# Repository Guidelines

## Structure

- `src/pages/`: routes; Chinese at the root, English under `src/pages/en/`
- `src/layouts/`: BaseLayout, ContentLayout, BlogPost, CommonPage
- `src/components/`: Astro components; React islands only where interaction needs it
- `src/content/`: `blog/`, `notes/` (plus empty `curated/`, `talks/`, `lab/` collections)
- `src/data/projects.ts`: project list used by `/projects`, `/en/projects`, and both homepages
- `src/site.config.ts`: site title, author, menu, footer, integrations
- `src/i18n/ui.ts`: nav labels and locale helpers
- `public/`: static assets; `src/assets/`: imported assets

## Commands

- `npm install` — install dependencies (Bun also works)
- `npm run dev` — local dev server at `http://localhost:4321`
- `npm run build` — production build; required after structural changes
- `npm run check` — Astro type + content validation
- `npm run format` — Prettier

## Conventions

- Two-space indentation, single quotes, no semicolons, 100-character print width (Prettier).
- `PascalCase` for components, `camelCase` for functions, kebab-case for route slugs.
- Blog and note English mirrors use `translationKey`; without it, the English list will skip the
  entry or link to `/en/.../undefined`.
- Keep Chinese and English page pairs in sync.
- Projects are data, not Markdown; edit `src/data/projects.ts` instead of creating pages.
- Don't add personal content from the upstream template (Waline, Umami, friend links, Jojo,
  terminal/dev mode). They were intentionally removed in v0.1.
