import type { APIRoute } from 'astro'

import { apiRoute, json } from '@/lib/api/http'
import { getRuntime } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    return json({
      data: {
        status: 'ok',
        version: 'v1',
        capabilities: {
          contentCrud: Boolean(
            env.CONTENT_API_TOKEN &&
              env.GITHUB_TOKEN &&
              env.GITHUB_OWNER &&
              env.GITHUB_REPO
          ),
          media: Boolean(env.MEDIA),
          deployHook: Boolean(env.DEPLOY_HOOK_URL)
        }
      },
      meta: {
        time: new Date().toISOString()
      }
    })
  })
