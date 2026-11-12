import type { SSRManifest } from 'astro'
import { handle } from '@astrojs/cloudflare/handler'
import { negotiateLanguage } from '@/i18n/negotiation'
import { hasEnVersion } from '@/i18n/translations'
import { withLangPrefix } from '@/i18n/ui'
import { App } from 'astro/app'

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest)
  return {
    default: {
      async fetch(
        request: Request,
        env: Parameters<typeof handle>[3],
        context: Parameters<typeof handle>[4]
      ) {
        // Astro uses DOM Request types; the adapter handler uses Workers Request types.
        const render = () =>
          handle(manifest, app, request as unknown as Parameters<typeof handle>[2], env, context)
        // SSR routes still use the normal Astro middleware (including /admin).
        if (app.match(request)) return render()
        // The adapter returns prerendered ASSETS before middleware can run.
        return negotiateLanguage(request, render, async (path) => {
          if (!(await hasEnVersion(path))) return false
          const target = new URL(
            withLangPrefix(path, 'en') + (path === '/' ? '/' : ''),
            request.url
          )
          const englishRequest = new Request(target, { method: 'HEAD' })
          const route = app.match(englishRequest)
          if (route && route.component !== 'src/pages/en/[...slug].astro') return true
          // A section helper can match an out-of-range pagination number. Only
          // negotiate when an actual English static file exists as well.
          const response = await env.ASSETS.fetch(englishRequest)
          return response.status === 200
        })
      }
    }
  }
}
