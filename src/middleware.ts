import type { MiddlewareHandler } from 'astro'

const notFound = new Response(null, {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' }
})

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const decoded = atob(padded)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

async function verifyAccessAssertion(request: Request) {
  const assertion = request.headers.get('cf-access-jwt-assertion')
  if (!assertion) return false
  const parts = assertion.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) return false

  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as {
      iss?: string
      aud?: string | string[]
      exp?: number
    }

    if (!claims.iss?.endsWith('.cloudflareaccess.com')) return false
    if (claims.exp && claims.exp * 1000 <= Date.now()) return false

    const expectedAudience = import.meta.env.CF_ACCESS_AUD as string | undefined
    if (expectedAudience) {
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
      if (!audiences.includes(expectedAudience)) return false
    }
    return true
  } catch {
    return false
  }
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pathname = context.url.pathname.replace(/\/+$/, '')
  if (pathname === '/admin') {
    const assertion = context.request.headers.get('cf-access-jwt-assertion')
    const matchesAccess = assertion ? await verifyAccessAssertion(context.request) : false
    if (import.meta.env.PROD && !matchesAccess) return notFound
  }

  return next()
}
