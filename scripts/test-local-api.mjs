// End-to-end smoke test for the local Worker. It refuses non-local base URLs
// so CRUD assertions cannot mutate a deployed site by accident.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = (process.env.LOCAL_API_BASE_URL || 'http://localhost:4321').replace(/\/+$/, '')
const token = process.env.LOCAL_API_TOKEN || 'dev-local-token'

if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(baseUrl)) {
  throw new Error('LOCAL_API_BASE_URL must point at localhost.')
}

const auth = { authorization: `Bearer ${token}` }
const created = { posts: [], notes: [], projects: [], media: [] }
let previousAvatar = null
let avatarChanged = false

try {
  const health = await call('GET', '/api/v1/health')
  assert(health.response.ok, `health returned ${health.response.status}`)
  assert(health.body.data.capabilities.contentCrud, 'content CRUD is not configured')
  assert(health.body.data.capabilities.media, 'R2 media binding is not configured')
  pass('health')

  const unauthorized = await fetch(`${baseUrl}/api/v1/posts`)
  assert(unauthorized.status === 401, 'posts route must reject missing auth')
  pass('auth guard')

  const postId = `api-test-${Date.now()}`
  const createdPost = await call('POST', '/api/v1/posts', {
    id: postId,
    locale: 'zh',
    title: 'Local API test',
    description: 'Created by the local API smoke test.',
    publishDate: '2026-10-17',
    tags: ['api-test'],
    body: '## Created through CRUD\n\nTemporary content.',
    format: 'md'
  })
  assert(createdPost.response.status === 201, `create post: ${createdPost.response.status}`)
  created.posts.push(postId)
  assert(createdPost.body.data.id === postId, 'created post id mismatch')
  pass('create post')

  const duplicate = await call('POST', '/api/v1/posts', {
    id: postId,
    locale: 'zh',
    title: 'Duplicate',
    description: 'Should fail.',
    publishDate: '2026-10-17',
    body: ''
  })
  assert(duplicate.response.status === 409, 'duplicate post must return 409')

  const fetchedPost = await call('GET', `/api/v1/posts/${postId}?locale=zh`)
  assert(fetchedPost.response.ok, `get post: ${fetchedPost.response.status}`)
  assert(fetchedPost.body.data.body.includes('Created through CRUD'), 'post body mismatch')
  pass('read post')

  const updatedPost = await call('PATCH', `/api/v1/posts/${postId}?locale=zh`, {
    title: 'Local API test updated',
    draft: true
  })
  assert(updatedPost.response.ok, `update post: ${updatedPost.response.status}`)
  assert(updatedPost.body.data.draft === true, 'post draft update missing')
  pass('update post')

  const noteId = `api-test-note-${Date.now()}`
  const createdNote = await call('POST', '/api/v1/notes', {
    id: noteId,
    locale: 'zh',
    title: 'Local note test',
    date: '2026-10-17',
    tags: ['api-test'],
    status: 'ready',
    body: 'Temporary note body.'
  })
  assert(createdNote.response.status === 201, `create note: ${createdNote.response.status}`)
  created.notes.push(noteId)

  const updatedNote = await call('PATCH', `/api/v1/notes/${noteId}?locale=zh`, {
    status: 'archived'
  })
  assert(updatedNote.response.ok, `update note: ${updatedNote.response.status}`)
  assert(updatedNote.body.data.status === 'archived', 'note status update missing')
  pass('note CRUD')

  const projectId = `api-test-project-${Date.now()}`
  const createdProject = await call('POST', '/api/v1/projects', {
    id: projectId,
    name: 'Local API Test',
    status: 'active',
    stack: ['Cloudflare'],
    featured: false,
    zh: { description: 'Temporary project.' },
    en: { description: 'Temporary project.' }
  })
  assert(createdProject.response.status === 201, `create project: ${createdProject.response.status}`)
  created.projects.push(projectId)

  const updatedProject = await call('PATCH', `/api/v1/projects/${projectId}`, {
    status: 'paused'
  })
  assert(updatedProject.response.ok, `update project: ${updatedProject.response.status}`)
  assert(updatedProject.body.data.status === 'paused', 'project status update missing')
  pass('project CRUD')

  const image = await readFile(resolve('public/avatar-fallback.png'))
  const mediaKey = `media/api-test/${Date.now()}.png`
  const uploadedMedia = await call('PUT', `/api/v1/media/${mediaKey}`, image, {
    'content-type': 'image/png'
  })
  assert(uploadedMedia.response.ok, `upload media: ${uploadedMedia.response.status}`)
  created.media.push(mediaKey)

  const media = await fetch(`${baseUrl}/api/v1/media/${mediaKey}`)
  assert(media.ok, `read media: ${media.status}`)
  assert(media.headers.get('content-type') === 'image/png', 'media content type mismatch')
  assert((await media.arrayBuffer()).byteLength === image.byteLength, 'media size mismatch')
  pass('media upload/read')

  const beforeAvatar = await fetch(`${baseUrl}/api/v1/avatar`, { redirect: 'manual' })
  if (beforeAvatar.status === 200) {
    previousAvatar = {
      bytes: Buffer.from(await beforeAvatar.arrayBuffer()),
      contentType: beforeAvatar.headers.get('content-type') || 'image/png'
    }
  }

  const uploadedAvatar = await call('PUT', '/api/v1/avatar', image, {
    'content-type': 'image/png'
  })
  assert(uploadedAvatar.response.ok, `upload avatar: ${uploadedAvatar.response.status}`)
  avatarChanged = true

  const avatar = await fetch(`${baseUrl}/api/v1/avatar`)
  assert(avatar.ok, `read avatar: ${avatar.status}`)
  assert((await avatar.arrayBuffer()).byteLength === image.byteLength, 'avatar size mismatch')
  pass('avatar upload/read')
} finally {
  for (const key of created.media.reverse()) {
    await call('DELETE', `/api/v1/media/${key}`).catch(() => {})
  }
  if (avatarChanged) {
    if (previousAvatar) {
      await call('PUT', '/api/v1/avatar', previousAvatar.bytes, {
        'content-type': previousAvatar.contentType
      }).catch(() => {})
    } else {
      await call('DELETE', '/api/v1/avatar').catch(() => {})
    }
  }
  for (const id of created.projects.reverse()) {
    await call('DELETE', `/api/v1/projects/${id}`).catch(() => {})
  }
  for (const id of created.notes.reverse()) {
    await call('DELETE', `/api/v1/notes/${id}?locale=zh`).catch(() => {})
  }
  for (const id of created.posts.reverse()) {
    await call('DELETE', `/api/v1/posts/${id}?locale=zh`).catch(() => {})
  }
}

async function call(method, path, body, headers = {}) {
  let payload
  if (body !== undefined && !(body instanceof Uint8Array)) {
    payload = JSON.stringify(body)
    headers = { ...headers, 'content-type': 'application/json' }
  } else {
    payload = body
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...auth, ...headers },
    body: payload
  })
  const text = await response.text()
  let parsed = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  return { response, body: parsed }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function pass(name) {
  console.log(`[api-test] PASS ${name}`)
}
