// In-memory GitHub Contents API stub for local CRUD testing.
// It seeds from the working tree and never writes repository files.
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.MOCK_GITHUB_PORT ?? 4330)
const files = new Map()

await seed('src/content')
await seedFile('src/data/projects.json')

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const tree = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/git\/trees\/[^/]+$/)
    const contents = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/)

    if (request.method === 'GET' && tree) {
      return sendJson(response, 200, {
        sha: 'mock-tree',
        truncated: false,
        tree: [...files.entries()].map(([path, file]) => ({
          path,
          mode: '100644',
          type: 'blob',
          sha: file.sha,
          size: file.content.length
        }))
      })
    }

    const path = contents ? decodePath(contents[1]) : null
    if (!path) return sendJson(response, 404, { message: 'Not Found' })

    if (request.method === 'GET') {
      const file = files.get(path)
      if (!file) return sendJson(response, 404, { message: 'Not Found' })
      return sendJson(response, 200, {
        type: 'file',
        path,
        sha: file.sha,
        size: file.content.length,
        content: file.content.toString('base64')
      })
    }

    const body = await readJson(request)
    if (request.method === 'PUT') {
      const existing = files.get(path)
      if (existing && (!body.sha || body.sha !== existing.sha)) {
        return sendJson(response, 409, { message: 'sha does not match' })
      }
      if (!existing && body.sha) {
        return sendJson(response, 409, { message: 'file does not exist' })
      }

      const content = Buffer.from(String(body.content ?? ''), 'base64')
      const file = { content, sha: hash(content) }
      files.set(path, file)
      console.log(`[mock-github] PUT ${path} (${content.length} bytes)`)
      return sendJson(response, 200, {
        content: { path, sha: file.sha },
        commit: { sha: `commit-${Date.now()}` }
      })
    }

    if (request.method === 'DELETE') {
      const existing = files.get(path)
      if (!existing) return sendJson(response, 404, { message: 'Not Found' })
      if (!body.sha || body.sha !== existing.sha) {
        return sendJson(response, 409, { message: 'sha does not match' })
      }
      files.delete(path)
      console.log(`[mock-github] DELETE ${path}`)
      return sendJson(response, 200, {
        commit: { sha: `commit-${Date.now()}` }
      })
    }

    return sendJson(response, 405, { message: 'Method Not Allowed' })
  } catch (error) {
    console.error('[mock-github]', error)
    return sendJson(response, 500, { message: 'Mock GitHub error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-github] http://127.0.0.1:${PORT} (${files.size} seeded files)`)
})

async function seed(start) {
  const absolute = join(ROOT, start)
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const path = join(absolute, entry.name)
    if (entry.isDirectory()) {
      await seed(relative(ROOT, path))
    } else if (entry.isFile()) {
      await seedFile(relative(ROOT, path))
    }
  }
}

async function seedFile(path) {
  const content = await readFile(join(ROOT, path))
  files.set(path.split(sep).join('/'), { content, sha: hash(content) })
}

function hash(content) {
  return createHash('sha1').update(content).digest('hex')
}

function decodePath(value) {
  return value
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8'
  })
  response.end(JSON.stringify(body))
}
