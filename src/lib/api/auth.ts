import { ApiError } from './http'
import type { RuntimeEnv } from './runtime'

export async function requireAuth(request: Request, env: RuntimeEnv) {
  if (!env.CONTENT_API_TOKEN) {
    throw new ApiError(
      503,
      'API_NOT_CONFIGURED',
      'CONTENT_API_TOKEN is not configured for this deployment.'
    )
  }

  const authorization = request.headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Use Authorization: Bearer <CONTENT_API_TOKEN>.')
  }

  const [actual, expected] = await Promise.all([digest(match[1]), digest(env.CONTENT_API_TOKEN)])
  if (!timingSafeEqual(actual, expected)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid API token.')
  }
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index]
  }
  return mismatch === 0
}
