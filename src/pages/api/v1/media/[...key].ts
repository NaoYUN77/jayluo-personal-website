import type { APIRoute } from 'astro'
import { requireAuth } from '@/lib/api/auth'
import { ApiError, apiRoute, json, requireBinding } from '@/lib/api/http'
import {
  mediaResponseData,
  normalizeMediaKey,
  readImageBody,
  serveMedia,
  uploadMedia
} from '@/lib/api/media'
import { getRuntime, runtimeNumber } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    const bucket = requireBinding(env.MEDIA)
    const key = routeKey(params.key)
    const object = await bucket.get(key)
    if (!object) throw new ApiError(404, 'NOT_FOUND', 'Media object not found.')
    return serveMedia(request, object)
  })

export const HEAD: APIRoute = GET

export const PUT: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const bucket = requireBinding(env.MEDIA)
    const key = routeKey(params.key)
    const { bytes, image } = await readImageBody(
      request,
      runtimeNumber(env.MAX_MEDIA_BYTES, 20 * 1024 * 1024)
    )
    const object = await uploadMedia(bucket, key, bytes, image)
    return json({
      data: mediaResponseData(request.url, key, object),
      meta: { deployQueued: false }
    })
  })

export const DELETE: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const bucket = requireBinding(env.MEDIA)
    await bucket.delete(routeKey(params.key))
    return new Response(null, { status: 204 })
  })

function routeKey(value: string | undefined) {
  if (!value) throw new ApiError(400, 'MISSING_MEDIA_KEY', 'Media key is required.')
  return normalizeMediaKey(value)
}
