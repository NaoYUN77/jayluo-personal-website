import { hasEnVersion } from './translations'
import { withLangPrefix, type Lang } from './ui'

export function preferredLanguage(header: string | null): Lang {
  const ranges = (header ?? '').split(',').flatMap((range, index) => {
    const [tag, ...parameters] = range.trim().split(';')
    const quality = parameters.find((parameter) => /^\s*q\s*=/i.test(parameter))
    const raw = quality?.split('=')[1]?.trim() ?? '1'
    if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) return []
    const q = Number(raw)
    const match = tag.trim().match(/^(en|zh)(?:-[a-z0-9]{1,8})*$/i)
    return q > 0 && match ? [{ lang: match[1].toLowerCase() as Lang, q, index }] : []
  })
  ranges.sort((a, b) => b.q - a.q || a.index - b.index)
  return ranges[0]?.lang ?? 'zh'
}

function cookieLanguage(header: string | null): Lang | undefined {
  for (const cookie of (header ?? '').split(';')) {
    const match = cookie.trim().match(/^lang=(zh|en)$/)
    if (match) return match[1] as Lang
  }
}

function withLanguageVary(response: Response) {
  const headers = new Headers(response.headers)
  const vary = (headers.get('Vary') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!vary.includes('*')) {
    for (const name of ['Accept-Language', 'Cookie']) {
      if (!vary.some((value) => value.toLowerCase() === name.toLowerCase())) vary.push(name)
    }
    headers.set('Vary', vary.join(', '))
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

/** Shared by SSR middleware and the Worker path serving prerendered assets. */
export async function negotiateLanguage(
  request: Request,
  next: () => Promise<Response>,
  hasAlternate: (path: string) => Promise<boolean> = hasEnVersion
): Promise<Response> {
  const url = new URL(request.url)
  let path: string
  try {
    path = decodeURI(url.pathname).replace(/\/+$/, '') || '/'
  } catch {
    return next()
  }
  if (path === '/en' || path.startsWith('/en/') || !(await hasAlternate(path))) return next()

  const lang =
    cookieLanguage(request.headers.get('Cookie')) ??
    preferredLanguage(request.headers.get('Accept-Language'))
  const crawler = /bot|crawler|spider|slurp|bingpreview/i.test(
    request.headers.get('User-Agent') ?? ''
  )
  if (request.method === 'GET' && !crawler && lang === 'en') {
    const target = withLangPrefix(path, 'en') + (path === '/' ? '/' : '')
    return withLanguageVary(
      new Response(null, {
        status: 302,
        headers: { Location: target + url.search, 'Cache-Control': 'private, no-store' }
      })
    )
  }
  return withLanguageVary(await next())
}
