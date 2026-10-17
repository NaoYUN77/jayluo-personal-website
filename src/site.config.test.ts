import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import config, { integ } from './site.config'

const SITE_NAME = 'Jayluo blog'

describe('site name', () => {
  test('config title is the site name for nav, titles, meta, OG, and RSS', () => {
    expect(config.title).toBe(SITE_NAME)
    const cardName = integ.links?.applyTip?.find((item) => item.name === 'Name')?.val
    expect(cardName).toBe(SITE_NAME)

    const zhRss = readFileSync(join(import.meta.dir, 'pages/rss.xml.ts'), 'utf8')
    const enRss = readFileSync(join(import.meta.dir, 'pages/en/rss.xml.ts'), 'utf8')
    expect(zhRss).toContain('title: config.title,')
    expect(enRss).toContain('title: `${config.title} (EN)`,')
  })

  test('web app manifest uses the site name', () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'public/favicon/site.webmanifest'), 'utf8')
    ) as { name: string; short_name: string }
    expect(manifest.name).toBe(SITE_NAME)
    expect(manifest.short_name).toBe(SITE_NAME)
  })

  test('nav brand stays on one line', () => {
    const header = readFileSync(join(import.meta.dir, 'components/Header.astro'), 'utf8')
    expect(header).toContain('whitespace-nowrap')
    expect(header).toContain('{config.title}')
  })
})
