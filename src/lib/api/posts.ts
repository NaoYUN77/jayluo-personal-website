import type { RuntimeEnv } from './runtime'
import {
  asRecord,
  assertBody,
  compactObject,
  hasOwn,
  parseMarkdownDocument,
  readBoolean,
  readDate,
  readOptionalDate,
  readOptionalString,
  readOptionalUrl,
  readRequiredString,
  readSlug,
  readStringArray,
  removeNullFields,
  serializeMarkdownDocument
} from './frontmatter'
import { deleteRepoFile, getRepoFile, listRepoPaths, putRepoFile } from './github'
import { ApiError, parseLocale } from './http'

const BLOG_ROOT = 'src/content/blog'
const EXTENSIONS = ['mdx', 'md'] as const

type Locale = 'zh' | 'en'
type Extension = (typeof EXTENSIONS)[number]

export interface PostInput {
  [key: string]: unknown
  id: string
  locale: Locale
  title?: unknown
  description?: unknown
  publishDate?: unknown
  updatedDate?: unknown
  tags?: unknown
  draft?: unknown
  language?: unknown
  translationKey?: unknown
  ogImage?: unknown
  tocDepth?: unknown
  tocLabels?: unknown
  comment?: unknown
  heroImage?: unknown
  body?: unknown
  format?: unknown
}

export type PostRecord = Record<string, unknown> & {
  type: 'post'
  id: string
  locale: Locale
  path: string
  version: string
  url: string
}

export async function listPosts(
  env: RuntimeEnv,
  locale: Locale,
  options: {
    includeBody?: boolean
    drafts?: 'all' | 'published' | 'only'
    limit?: number
    offset?: number
  }
) {
  const paths = (await listRepoPaths(env, `${BLOG_ROOT}/`))
    .filter((path) => postIdFromPath(path, locale) !== null)
    .sort()
    .reverse()

  const records = []
  const scanLimit = Math.min(paths.length, Math.max(options.limit ?? 20, 100))
  for (const path of paths.slice(0, scanLimit)) {
    const file = await getRepoFile(env, path)
    if (!file) continue
    const record = toPostRecord(file.path, file.sha, file.content, locale, options.includeBody)
    const draftMode = options.drafts ?? 'all'
    if (draftMode === 'published' && record.draft) continue
    if (draftMode === 'only' && !record.draft) continue
    records.push(record)
  }

  records.sort((a, b) => String(b.publishDate).localeCompare(String(a.publishDate)))
  const offset = options.offset ?? 0
  return records.slice(offset, offset + (options.limit ?? 20))
}

export async function getPost(
  env: RuntimeEnv,
  id: string,
  locale: Locale,
  includeBody = true
) {
  const file = await findPostFile(env, id, locale)
  if (!file) return null
  return toPostRecord(file.path, file.sha, file.content, locale, includeBody)
}

export async function createPost(env: RuntimeEnv, input: PostInput) {
  const id = readSlug(input.id)
  const locale = parseLocale(input.locale)
  const existing = await findPostFile(env, id, locale)
  if (existing) {
    throw new ApiError(409, 'ALREADY_EXISTS', `Post "${id}" already exists for ${locale}.`)
  }

  const extension = readExtension(input.format)
  const data = normalizePostData(input, locale, true)
  const body = assertBody(input.body ?? '')
  const path = postPath(id, locale, extension)

  const result = await putRepoFile(
    env,
    path,
    serializeMarkdownDocument({ data, body }),
    `content(post): create ${id} (${locale})`
  )

  return {
    record: toPostRecord(path, result.sha, serializeMarkdownDocument({ data, body }), locale, true),
    commit: result.commit
  }
}

export async function updatePost(
  env: RuntimeEnv,
  id: string,
  locale: Locale,
  input: Record<string, unknown>
) {
  const file = await findPostFile(env, id, locale)
  if (!file) return null

  const document = parseMarkdownDocument(file.content, file.path)
  const data = normalizePostData(
    { ...document.data, ...inputWithoutBody(input) },
    locale,
    false,
    document.data
  )
  const body = hasOwn(input, 'body') ? assertBody(input.body) : document.body
  const content = serializeMarkdownDocument({ data, body })
  const result = await putRepoFile(
    env,
    file.path,
    content,
    `content(post): update ${id} (${locale})`,
    file.sha
  )

  return {
    record: toPostRecord(file.path, result.sha, content, locale, true),
    commit: result.commit
  }
}

export async function deletePost(env: RuntimeEnv, id: string, locale: Locale) {
  const file = await findPostFile(env, id, locale)
  if (!file) return null

  await deleteRepoFile(env, file.path, `content(post): delete ${id} (${locale})`, file.sha)
  return { path: file.path }
}

async function findPostFile(env: RuntimeEnv, id: string, locale: Locale) {
  for (const extension of EXTENSIONS) {
    const file = await getRepoFile(env, postPath(id, locale, extension))
    if (file) return file
  }
  return null
}

function postPath(id: string, locale: Locale, extension: Extension) {
  return `${BLOG_ROOT}/${id}/post${locale === 'en' ? '.en' : ''}.${extension}`
}

function postIdFromPath(path: string, locale: Locale) {
  const prefix = `${BLOG_ROOT}/`
  if (!path.startsWith(prefix)) return null
  const relative = path.slice(prefix.length)
  const match = relative.match(
    locale === 'en' ? /^([^/]+)\/post\.en\.(md|mdx)$/ : /^([^/]+)\/post\.(md|mdx)$/
  )
  return match?.[1] ?? null
}

function readExtension(value: unknown): Extension {
  if (value === undefined || value === null || value === '') return 'mdx'
  if (value === 'md' || value === 'mdx') return value
  throw new ApiError(400, 'INVALID_FIELD', 'format must be "md" or "mdx".')
}

function normalizePostData(
  input: Record<string, unknown>,
  locale: Locale,
  creating: boolean,
  existing?: Record<string, unknown>
) {
  const data: Record<string, unknown> = { ...(existing ?? {}) }

  assignRequired(data, input, 'title', (value) => readRequiredString(value, 'title', { max: 60 }))
  assignRequired(data, input, 'description', (value) =>
    readRequiredString(value, 'description', { max: 160 })
  )
  assignRequired(data, input, 'publishDate', (value) => readDate(value, 'publishDate'))

  assignOptional(data, input, 'updatedDate', (value) => readOptionalDate(value, 'updatedDate'))
  assignOptional(data, input, 'tags', (value) =>
    readStringArray(value, 'tags', { maxItems: 20, maxLength: 40 })
  )
  assignOptional(data, input, 'draft', (value) => readBoolean(value, 'draft'))
  assignOptional(data, input, 'language', (value) =>
    readOptionalString(value, 'language', { max: 20 })
  )
  assignOptional(data, input, 'translationKey', (value) => {
    const text = readOptionalString(value, 'translationKey', { max: 160 })
    if (text && !/^[a-z0-9][a-z0-9/.-]*$/.test(text)) {
      throw new ApiError(400, 'INVALID_FIELD', 'translationKey contains invalid characters.')
    }
    return text
  })
  assignOptional(data, input, 'ogImage', (value) => readOptionalUrl(value, 'ogImage'))
  assignOptional(data, input, 'tocDepth', (value) => {
    if (value === null) return null
    const depth = Number(value)
    if (!Number.isInteger(depth) || depth < 2 || depth > 6) {
      throw new ApiError(400, 'INVALID_FIELD', 'tocDepth must be an integer from 2 to 6.')
    }
    return depth
  })
  assignOptional(data, input, 'tocLabels', (value) => {
    if (value === null) return null
    return asRecord(value, 'tocLabels')
  })
  assignOptional(data, input, 'comment', (value) => readBoolean(value, 'comment'))
  assignOptional(data, input, 'heroImage', (value) => {
    if (value === null) return null
    return asRecord(value, 'heroImage')
  })

  if (!hasOwn(data, 'tags')) data.tags = []
  if (!hasOwn(data, 'draft')) data.draft = false
  if (!hasOwn(data, 'comment')) data.comment = true
  if (locale === 'en' && creating) {
    if (!data.language) data.language = 'en'
    if (!data.translationKey) data.translationKey = `${input.id}/post`
  }
  if (locale === 'zh' && data.language === 'en') delete data.language

  if (creating) {
    const missing = ['title', 'description', 'publishDate'].filter((key) => !data[key])
    if (missing.length) {
      throw new ApiError(
        400,
        'MISSING_FIELD',
        `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`
      )
    }
  }

  return removeNullFields(compactObject(data))
}

function inputWithoutBody(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'body'))
}

function toPostRecord(
  path: string,
  sha: string,
  source: string,
  locale: Locale,
  includeBody = true
) {
  const document = parseMarkdownDocument(source, path)
  const id = postIdFromPath(path, locale) ?? path.split('/')[3]
  const translationKey =
    typeof document.data.translationKey === 'string'
      ? document.data.translationKey
      : `${id}/post`

  return {
    type: 'post' as const,
    id,
    locale,
    path,
    version: sha,
    url: locale === 'zh' ? `/blog/${id}/post` : `/en/blog/${translationKey}`,
    ...document.data,
    ...(includeBody ? { body: document.body } : {})
  } as PostRecord
}

function assignRequired(
  target: Record<string, unknown>,
  input: Record<string, unknown>,
  key: string,
  normalize: (value: unknown) => unknown
) {
  if (hasOwn(input, key)) target[key] = normalize(input[key])
}

function assignOptional(
  target: Record<string, unknown>,
  input: Record<string, unknown>,
  key: string,
  normalize: (value: unknown) => unknown
) {
  if (hasOwn(input, key)) target[key] = normalize(input[key])
}

export function parsePostCreateInput(value: Record<string, unknown>): PostInput {
  return {
    ...value,
    id: readSlug(value.id),
    locale: parseLocale(value.locale)
  }
}
