import { getRuntime, type RuntimeEnv } from './runtime'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const NO_STORE = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8'
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...NO_STORE,
      ...init.headers
    }
  })
}

export function success(data: unknown, init: ResponseInit = {}) {
  return json({ data }, init)
}

export function successList(
  data: unknown[],
  meta: Record<string, unknown>,
  init: ResponseInit = {}
) {
  return json({ data, meta }, init)
}

export async function apiRoute(handler: () => Promise<Response>) {
  try {
    return await handler()
  } catch (error) {
    if (error instanceof ApiError) {
      return json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details === undefined ? {} : { details: error.details })
          }
        },
        { status: error.status }
      )
    }

    console.error('[api] unhandled error', error)
    return json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected API error.'
        }
      },
      { status: 500 }
    )
  }
}

export async function readJsonBody(request: Request, maxBytes = 1_000_000) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `JSON body must be <= ${maxBytes} bytes.`)
  }

  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `JSON body must be <= ${maxBytes} bytes.`)
  }
  if (buffer.byteLength === 0) {
    throw new ApiError(400, 'EMPTY_BODY', 'A JSON request body is required.')
  }

  try {
    const value = JSON.parse(new TextDecoder().decode(buffer))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object')
    }
    return value as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be a JSON object.')
  }
}

export function parseLocale(value: unknown, fallback: 'zh' | 'en' = 'zh') {
  if (value === undefined || value === null || value === '') return fallback
  if (value === 'zh' || value === 'en') return value
  throw new ApiError(400, 'INVALID_LOCALE', 'locale must be "zh" or "en".')
}

export function parseInteger(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  if (value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export function parseBoolean(value: string | null, fallback = false) {
  if (value === null) return fallback
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

export function parseDraftMode(value: string | null): 'all' | 'published' | 'only' {
  if (value === null || value === '' || value === 'all') return 'all'
  if (value === 'true' || value === 'only') return 'only'
  if (value === 'false' || value === 'published') return 'published'
  throw new ApiError(400, 'INVALID_DRAFT_FILTER', 'draft must be all, true, false, only, or published.')
}

export function triggerDeploy(locals: App.Locals) {
  const { env, ctx } = getRuntime(locals)
  if (!env.DEPLOY_HOOK_URL) return false

  const task = fetch(env.DEPLOY_HOOK_URL, { method: 'POST' })
    .then((response) => {
      if (!response.ok) {
        console.warn(`[api] deploy hook returned ${response.status}`)
      }
    })
    .catch((error) => {
      console.warn('[api] deploy hook request failed', error)
    })

  ctx?.waitUntil(task)
  return true
}

export function requireBinding(value: RuntimeEnv['MEDIA'], name = 'MEDIA') {
  if (!value) {
    throw new ApiError(
      503,
      'R2_NOT_CONFIGURED',
      `Missing R2 binding "${name}". Add it to wrangler.jsonc and redeploy.`
    )
  }
  return value
}
