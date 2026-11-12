import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://127.0.0.1:8791'
const cases = [
  ['English home', '/', { 'Accept-Language': 'en-US,en;q=0.9' }, 302, '/en/'],
  ['Chinese home', '/', { 'Accept-Language': 'zh-CN' }, 200],
  ['explicit Chinese', '/', { 'Accept-Language': 'en', Cookie: 'lang=zh' }, 200],
  ['explicit English', '/', { 'Accept-Language': 'zh-CN', Cookie: 'lang=en' }, 302, '/en/'],
  ['query preserved', '/?from=test&x=1', { 'Accept-Language': 'en' }, 302, '/en/?from=test&x=1'],
  ['Chinese higher q', '/', { 'Accept-Language': 'en;q=0.2,zh;q=0.9' }, 200],
  ['bot stays Chinese', '/', { 'Accept-Language': 'en', 'User-Agent': 'Googlebot' }, 200],
  ['static contact', '/contact', { 'Accept-Language': 'en' }, 302, '/en/contact'],
  ['SSR about', '/about?from=test', { 'Accept-Language': 'en' }, 302, '/en/about?from=test'],
  [
    'translated post',
    '/blog/20261017---hello-world/post',
    { 'Accept-Language': 'en' },
    302,
    '/en/blog/20261017---hello-world/post'
  ],
  [
    'translated note',
    '/notes/content-model',
    { 'Accept-Language': 'en' },
    302,
    '/en/notes/content-model'
  ],
  ['English stays explicit', '/en/', { 'Accept-Language': 'zh' }, 200],
  ['out-of-range page', '/blog/999', { 'Accept-Language': 'en' }, 404],
  ['unknown post', '/blog/no-translation/post', { 'Accept-Language': 'en' }, 404],
  ['admin still protected', '/admin', { 'Accept-Language': 'en' }, 404],
  ['image bypasses negotiation', '/favicon/favicon.ico', { 'Accept-Language': 'en' }, 200]
]
for (const [name, path, headers, status, location] of cases) {
  const response = await fetch(base + path, { headers, redirect: 'manual' })
  assert.equal(response.status, status, name)
  if (location) assert.equal(response.headers.get('Location'), location, name)
  const vary = response.headers.get('Vary') ?? ''
  if (path === '/' || status === 302) {
    assert.match(vary, /Accept-Language/i, name)
    assert.match(vary, /Cookie/i, name)
  }
  if (path === '/en/' || path.startsWith('/favicon/'))
    assert(!/Accept-Language|Cookie/i.test(vary), name)
  if (status === 200 && path === '/')
    assert.match(await response.text(), /<html lang="zh-CN"/, name)
  else await response.arrayBuffer()
  console.log(`${name}: ${status}${location ? ' -> ' + location : ''}`)
}
for (const method of ['HEAD', 'POST']) {
  const response = await fetch(base, {
    method,
    headers: { 'Accept-Language': 'en' },
    redirect: 'manual'
  })
  assert.equal(response.status, 200, method)
  assert.match(response.headers.get('Vary'), /Accept-Language.*Cookie/i)
  await response.arrayBuffer()
  console.log(`${method}: 200, no redirect, Vary set`)
}
