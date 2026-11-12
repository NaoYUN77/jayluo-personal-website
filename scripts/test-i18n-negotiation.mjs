import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/i18n/negotiation.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  plugins: [
    {
      name: 'collection-fixture',
      setup(build) {
        build.onResolve({ filter: /^\.\/translations$/ }, () => ({
          path: 'translations',
          namespace: 'fixture'
        }))
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export async function hasEnVersion() { return false }'
        }))
      }
    }
  ]
})
const context = { module: { exports: {} }, Request, Response, Headers, URL }
vm.runInNewContext(bundle.outputFiles[0].text, context)
const { preferredLanguage, negotiateLanguage } = context.module.exports
const alternates = async (path) => ['/', '/contact', '/blog/translated/post'].includes(path)
const next = async () => new Response('中文', { headers: { Vary: 'Accept-Encoding' } })
const request = (path = '/', headers = {}, method = 'GET') =>
  new Request('https://example.test' + path, { headers, method })

test('language ranges honor q weights, stable ties, supported tags and exclusions', () => {
  for (const [header, expected] of [
    ['en-US,en;q=0.9', 'en'],
    ['zh-CN,en;q=0.9', 'zh'],
    ['en;q=0.2,zh-Hans;q=0.9', 'zh'],
    ['fr;q=1,en-GB;q=0.8,zh;q=0.5', 'en'],
    ['zh;q=0.5,en;q=0.5', 'zh'],
    ['en;q=0.5,zh;q=0.5', 'en'],
    ['en;q=0,zh;q=0.2', 'zh'],
    ['en;q=2,zh;q=0.2', 'zh'],
    ['en;q=bad', 'zh'],
    ['*', 'zh'],
    [null, 'zh']
  ])
    assert.equal(preferredLanguage(header), expected, header)
})

test('English GET redirects only paired Chinese pages and preserves query strings', async () => {
  const response = await negotiateLanguage(
    request('/?from=friend&x=1', { 'Accept-Language': 'en-US,en;q=0.9' }),
    next,
    alternates
  )
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), '/en/?from=friend&x=1')
  assert.equal(response.headers.get('Vary'), 'Accept-Language, Cookie')
  const nested = await negotiateLanguage(
    request('/blog/translated/post/', { 'Accept-Language': 'en' }),
    next,
    alternates
  )
  assert.equal(nested.headers.get('Location'), '/en/blog/translated/post')
  for (const path of [
    '/en/',
    '/en/contact',
    '/blog/chinese-only/post',
    '/_astro/app.js',
    '/admin'
  ]) {
    const result = await negotiateLanguage(
      request(path, { 'Accept-Language': 'en' }),
      next,
      alternates
    )
    assert.equal(result.status, 200, path)
    assert.equal(result.headers.get('Vary'), 'Accept-Encoding', path)
  }
})

test('explicit cookies override headers; invalid cookies fall back to negotiation', async () => {
  const zh = await negotiateLanguage(
    request('/', { Cookie: 'other=1; lang=zh', 'Accept-Language': 'en' }),
    next,
    alternates
  )
  assert.equal(zh.status, 200)
  assert.equal(await zh.text(), '中文')
  assert.equal(zh.headers.get('Vary'), 'Accept-Encoding, Accept-Language, Cookie')
  const en = await negotiateLanguage(
    request('/', { Cookie: 'lang=en', 'Accept-Language': 'zh-CN' }),
    next,
    alternates
  )
  assert.equal(en.status, 302)
  const invalid = await negotiateLanguage(
    request('/', { Cookie: 'lang=fr', 'Accept-Language': 'en' }),
    next,
    alternates
  )
  assert.equal(invalid.status, 302)
})

test('bots, HEAD and non-GET stay Chinese with Vary', async () => {
  for (const ua of ['Googlebot', 'bingbot', 'ExampleCrawler', 'some-spider']) {
    const response = await negotiateLanguage(
      request('/', { 'User-Agent': ua, 'Accept-Language': 'en' }),
      next,
      alternates
    )
    assert.equal(response.status, 200, ua)
    assert.match(response.headers.get('Vary'), /Cookie/)
  }
  for (const method of ['HEAD', 'POST', 'OPTIONS']) {
    const response = await negotiateLanguage(
      request('/', { 'Accept-Language': 'en' }, method),
      next,
      alternates
    )
    assert.equal(response.status, 200, method)
    assert.match(response.headers.get('Vary'), /Accept-Language/)
  }
})
