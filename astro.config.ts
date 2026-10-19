import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import cloudflare from '@astrojs/cloudflare'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import AstroPureIntegration from 'astro-pure'
import { defineConfig } from 'astro/config'
import rehypeKatex from 'rehype-katex'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkMath from 'remark-math'

import { buildSeo } from './scripts/seo/build.mjs'
import { sectionMetadata } from './src/lib/seo/metadata'
// Others
// import { visualizer } from 'rollup-plugin-visualizer'

// Local integrations
// Local rehype & remark plugins
import rehypeAutolinkHeadings from './src/plugins/rehype-auto-link-headings.ts'
import remarkReadingTime from './src/plugins/remark-reading-time.ts'
// Shiki
import {
  addCopyButton,
  addLanguage,
  addTitle,
  transformerNotationDiff,
  transformerNotationHighlight,
  updateStyle
} from './src/plugins/shiki-transformers.ts'
import config from './src/site.config.ts'

const excludedSitemapPathPatterns = [
  /^\/(?:en\/)?404\/?$/,
  /^\/(?:en\/)?search\/?$/,
  /^\/api(?:\/|$)/
]

const siteUrl = (process.env.SITE_URL || 'https://example.com').replace(/\/+$/, '')

const shouldIncludeInSitemap = (page: string) => {
  const { pathname } = new URL(page)
  return !excludedSitemapPathPatterns.some((pattern) => pattern.test(pathname))
}

const exposeSingleSitemap = (): AstroIntegration => ({
  name: 'expose-single-sitemap',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const outputDir = fileURLToPath(dir)
      await buildSeo(
        outputDir,
        process.env,
        ['/about', '/en/about'].map((path) => ({
          path,
          ...sectionMetadata(path),
          noindex: false,
          alternates: [
            { lang: 'zh-CN', url: `${siteUrl}/about` },
            { lang: 'en', url: `${siteUrl}/en/about` },
            { lang: 'x-default', url: `${siteUrl}/about` }
          ],
          sources: [`src/pages${path}/index.astro`]
        }))
      )
    }
  }
})

const bilingualReadingTime = (): AstroIntegration => ({
  name: 'bilingual-reading-time',
  hooks: {
    'astro:config:setup': ({ updateConfig }) => {
      // Run after astro-pure's reading-time plugin so this bilingual estimate wins.
      updateConfig({
        markdown: {
          remarkPlugins: [remarkReadingTime]
        }
      })
    }
  }
})

// https://astro.build/config
export default defineConfig({
  // Top-Level Options
  site: siteUrl,
  // base: '/docs',
  trailingSlash: 'never',

  // Adapter
  // https://docs.astro.build/en/guides/deploy/
  // Local development uses Wrangler's platform proxy. Deployment is a
  // separate, explicit step.
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: {
      enabled: true,
      configPath: 'wrangler.jsonc'
    }
  }),
  output: 'server',

  integrations: [
    sitemap({
      filter: shouldIncludeInSitemap
    }),
    exposeSingleSitemap(),
    // astro-pure will automatically add sitemap, mdx & unocss
    AstroPureIntegration(config),
    bilingualReadingTime(),
    react()
  ],
  // root: './my-project-directory',

  // Prefetch Options
  prefetch: true,
  // Server Options
  server: {
    host: true
  },
  // Markdown Options
  markdown: {
    // remark-cjk-friendly：修复 **加粗** 紧贴全角标点时不渲染的 CommonMark flanking 问题
    remarkPlugins: [remarkMath, remarkCjkFriendly],
    rehypePlugins: [
      [rehypeKatex, {}],
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['anchor'] },
          content: { type: 'text', value: '#' }
        }
      ]
    ],
    // https://docs.astro.build/en/guides/syntax-highlighting/
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      },
      // Astro's markdown-remark bundles Shiki 3 while the root install resolves
      // Shiki 4. The transformer implementations are compatible, but the two
      // type copies are not, so keep the cast.
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
        updateStyle(),
        addTitle(),
        addLanguage(),
        addCopyButton(2000)
      ] as any
    }
  },
  experimental: {
    contentIntellisense: true
  },
  vite: {
    define: {
      'import.meta.env.DRAFT_PREVIEW': JSON.stringify(
        process.env.DRAFT_PREVIEW === 'true' ||
          (Boolean(process.env.CF_PAGES_BRANCH) &&
            process.env.CF_PAGES_BRANCH !== (process.env.CF_PAGES_PRODUCTION_BRANCH || 'main'))
      )
    },
    plugins: [
      //   visualizer({
      //     emitFile: true,
      //     filename: 'stats.html'
      //   })
    ],
    resolve: {
      dedupe: ['react', 'react-dom']
    },
    ssr: {
      external: ['@resvg/resvg-js'],
      noExternal: ['satori']
    },
    optimizeDeps: {
      include: [
        // Jojo's vendor runtime and intro import these; pre-bundle them so a late
        // discovery never re-optimizes into a second React copy in dev
        'react',
        'react/jsx-runtime',
        'react-dom/client',
        'satori',
        'linebreak',
        'base64-js',
        'unicode-trie',
        'unicode-properties',
        '@waline/client',
        'recaptcha-v3'
      ],
      esbuildOptions: {
        plugins: [
          {
            name: 'externalize-virtual-modules',
            setup(build) {
              build.onResolve({ filter: /^virtual:/ }, (args) => ({
                path: args.path,
                external: true
              }))
            }
          }
        ]
      }
    }
  }
})
