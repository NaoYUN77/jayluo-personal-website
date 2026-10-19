import type { APIRoute } from 'astro'
import { requireAuth } from '@/lib/api/auth'
import { apiRoute, json, requireBinding } from '@/lib/api/http'
import {
  AVATAR_KEY,
  avatarResponseData,
  readImageBody,
  serveMedia,
  uploadAvatar
} from '@/lib/api/media'
import { getRuntime, runtimeNumber } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    const object = env.MEDIA ? await env.MEDIA.get(AVATAR_KEY) : null
    if (object) {
      return serveMedia(request, object, {
        cacheControl: 'public, max-age=60, must-revalidate'
      })
    }
    return Response.redirect(new URL('/avatar-fallback.svg', request.url), 302)
  })

export const HEAD: APIRoute = GET

export const PUT: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const bucket = requireBinding(env.MEDIA)
    const { bytes, image } = await readImageBody(
      request,
      runtimeNumber(env.MAX_AVATAR_BYTES, 5 * 1024 * 1024)
    )
    const object = await uploadAvatar(bucket, bytes, image)

    return json({
      data: avatarResponseData(request.url, object),
      meta: { deployQueued: false }
    })
  })

export const DELETE: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const bucket = requireBinding(env.MEDIA)
    await bucket.delete(AVATAR_KEY)
    return new Response(null, { status: 204 })
  })
