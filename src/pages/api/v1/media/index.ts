import type { APIRoute } from 'astro'

import { requireAuth } from '@/lib/api/auth'
import {
  ApiError,
  apiRoute,
  json,
  parseInteger,
  requireBinding,
  successList
} from '@/lib/api/http'
import {
  detectImage,
  generatedMediaKey,
  mediaResponseData,
  normalizeMediaKey,
  normalizeMediaPrefix,
  uploadMedia
} from '@/lib/api/media'
import {
  getRuntime,
  runtimeNumber
} from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const bucket = requireBinding(env.MEDIA)
    const url = new URL(request.url)
    const prefix = normalizeMediaPrefix(url.searchParams.get('prefix'))
    const limit = parseInteger(url.searchParams.get('limit'), 50, 1, 100)
    const cursor = url.searchParams.get('cursor') || undefined
    const result = await bucket.list({ prefix, limit, cursor })

    return successList(
      result.objects.map((object) => mediaResponseData(request.url, object.key, object)),
      {
        prefix,
        count: result.objects.length,
        truncated: result.truncated,
        cursor: result.truncated ? result.cursor ?? null : null
      }
    )
  })

export const POST: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const bucket = requireBinding(env.MEDIA)
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new ApiError(
        415,
        'MULTIPART_REQUIRED',
        'POST /api/v1/media expects multipart/form-data with a "file" field. Use PUT /api/v1/media/{key} for raw bytes.'
      )
    }

    const maxBytes = runtimeNumber(env.MAX_MEDIA_BYTES, 20 * 1024 * 1024)
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new ApiError(400, 'INVALID_MULTIPART', 'Could not parse multipart form data.')
    }

    const candidate = form.get('file') ?? form.get('image')
    if (!(candidate instanceof File)) {
      throw new ApiError(400, 'MISSING_FILE', 'Add an image in the "file" form field.')
    }
    if (candidate.size === 0 || candidate.size > maxBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Image must be between 1 and ${maxBytes} bytes.`)
    }

    const bytes = await candidate.arrayBuffer()
    const image = detectImage(bytes)
    const requestedKey = form.get('key')
    const key =
      typeof requestedKey === 'string' && requestedKey
        ? normalizeMediaKey(requestedKey)
        : generatedMediaKey(candidate.name, image)
    const object = await uploadMedia(bucket, key, bytes, image, candidate.name)

    return json(
      {
        data: mediaResponseData(request.url, key, object),
        meta: { deployQueued: false }
      },
      {
        status: 201,
        headers: {
          location: new URL(`/api/v1/media/${key}`, request.url).href
        }
      }
    )
  })
