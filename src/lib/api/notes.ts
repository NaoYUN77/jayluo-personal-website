import {
  assertBody,
  compactObject,
  hasOwn,
  parseMarkdownDocument,
  readBoolean,
  readDate,
  readEnum,
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
import type { RuntimeEnv } from './runtime'

const NOTES_ROOT = 'src/content/notes'
const EXTENSIONS = ['md', 'mdx'] as const
const TYPES = ['note', 'snippet', 'draft', 'idea', 'research', 'reference'] as const
const STATUSES = ['in-progress', 'incomplete', 'ready', 'archived'] as const

type Locale = 'zh' | 'en'
type Extension = (typeof EXTENSIONS)[number]
type NoteInput = Record<string, unknown> & {
  id?: unknown
  locale?: unknown
  body?: unknown
  format?: unknown
}

type NoteRecord = Record<string, unknown> & {
  type: 'note'
  id: string
  locale: Locale
  path: string
  version: string
  url: string
}

export async function listNotes(
  env: RuntimeEnv,
  locale: Locale,
  options: {
    includeBody?: boolean
    drafts?: 'all' | 'published' | 'only'
    limit?: number
    offset?: number
  }
) {
  const paths = (await listRepoPaths(env, `${NOTES_ROOT}/`))
    .filter((path) => noteIdFromPath(path, locale) !== null)
    .sort()
    .reverse()

  const records = []
  const scanLimit = Math.min(paths.length, Math.max(options.limit ?? 20, 100))
  for (const path of paths.slice(0, scanLimit)) {
    const file = await getRepoFile(env, path)
    if (!file) continue
    const record = toNoteRecord(file.path, file.sha, file.content, locale, options.includeBody)
    const draftMode = options.drafts ?? 'all'
    if (draftMode === 'published' && record.draft) continue
    if (draftMode === 'only' && !record.draft) continue
    records.push(record)
  }

  records.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const offset = options.offset ?? 0
  return records.slice(offset, offset + (options.limit ?? 20))
}

export async function getNote(env: RuntimeEnv, id: string, locale: Locale, includeBody = true) {
  const file = await findNoteFile(env, id, locale)
  if (!file) return null
  return toNoteRecord(file.path, file.sha, file.content, locale, includeBody)
}

export async function createNote(env: RuntimeEnv, input: NoteInput) {
  const id = readSlug(input.id)
  const locale = parseLocale(input.locale)
  const existing = await findNoteFile(env, id, locale)
  if (existing) {
    throw new ApiError(409, 'ALREADY_EXISTS', `Note "${id}" already exists for ${locale}.`)
  }

  const extension = readExtension(input.format)
  const data = normalizeNoteData(input, locale, true)
  const body = assertBody(input.body ?? '')
  const path = notePath(id, locale, extension)
  const content = serializeMarkdownDocument({ data, body })
  const result = await putRepoFile(env, path, content, `content(note): create ${id} (${locale})`)

  return {
    record: toNoteRecord(path, result.sha, content, locale, true),
    commit: result.commit
  }
}

export async function updateNote(
  env: RuntimeEnv,
  id: string,
  locale: Locale,
  input: Record<string, unknown>
) {
  const file = await findNoteFile(env, id, locale)
  if (!file) return null

  const document = parseMarkdownDocument(file.content, file.path)
  const data = normalizeNoteData(
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
    `content(note): update ${id} (${locale})`,
    file.sha
  )

  return {
    record: toNoteRecord(file.path, result.sha, content, locale, true),
    commit: result.commit
  }
}

export async function deleteNote(env: RuntimeEnv, id: string, locale: Locale) {
  const file = await findNoteFile(env, id, locale)
  if (!file) return null

  await deleteRepoFile(env, file.path, `content(note): delete ${id} (${locale})`, file.sha)
  return { path: file.path }
}

async function findNoteFile(env: RuntimeEnv, id: string, locale: Locale) {
  for (const extension of EXTENSIONS) {
    const file = await getRepoFile(env, notePath(id, locale, extension))
    if (file) return file
  }
  return null
}

function notePath(id: string, locale: Locale, extension: Extension) {
  return `${NOTES_ROOT}/${id}${locale === 'en' ? '.en' : ''}.${extension}`
}

function noteIdFromPath(path: string, locale: Locale) {
  const prefix = `${NOTES_ROOT}/`
  if (!path.startsWith(prefix)) return null
  const relative = path.slice(prefix.length)
  const match = relative.match(
    locale === 'en' ? /^([a-z0-9][a-z0-9-]*)\.en\.(md|mdx)$/ : /^([a-z0-9][a-z0-9-]*)\.(md|mdx)$/
  )
  return match?.[1] ?? null
}

function readExtension(value: unknown): Extension {
  if (value === undefined || value === null || value === '') return 'md'
  if (value === 'md' || value === 'mdx') return value
  throw new ApiError(400, 'INVALID_FIELD', 'format must be "md" or "mdx".')
}

function normalizeNoteData(
  input: Record<string, unknown>,
  locale: Locale,
  creating: boolean,
  existing?: Record<string, unknown>
) {
  const data: Record<string, unknown> = { ...(existing ?? {}) }

  assignRequired(data, input, 'title', (value) => readRequiredString(value, 'title', { max: 120 }))
  assignRequired(data, input, 'date', (value) => readDate(value, 'date'))
  assignOptional(data, input, 'description', (value) =>
    readOptionalString(value, 'description', { max: 300 })
  )
  assignOptional(data, input, 'updatedDate', (value) => readOptionalDate(value, 'updatedDate'))
  assignOptional(data, input, 'tags', (value) =>
    readStringArray(value, 'tags', { maxItems: 20, maxLength: 40 })
  )
  assignOptional(data, input, 'type', (value) => readEnum(value, 'type', TYPES))
  assignOptional(data, input, 'status', (value) => readEnum(value, 'status', STATUSES))
  assignOptional(data, input, 'draft', (value) => readBoolean(value, 'draft'))
  assignOptional(data, input, 'language', (value) =>
    readOptionalString(value, 'language', { max: 20 })
  )
  assignOptional(data, input, 'translationKey', (value) =>
    readOptionalString(value, 'translationKey', { max: 160 })
  )
  assignOptional(data, input, 'relatedBlog', (value) =>
    value === null ? null : readStringArray(value, 'relatedBlog', { maxItems: 20, maxLength: 160 })
  )
  assignOptional(data, input, 'relatedNote', (value) =>
    value === null ? null : readStringArray(value, 'relatedNote', { maxItems: 20, maxLength: 160 })
  )
  assignOptional(data, input, 'source', (value) => readOptionalUrl(value, 'source'))

  if (!hasOwn(data, 'tags')) data.tags = []
  if (!hasOwn(data, 'type')) data.type = 'note'
  if (!hasOwn(data, 'status')) data.status = 'in-progress'
  if (!hasOwn(data, 'draft')) data.draft = false
  if (locale === 'en' && creating) {
    if (!data.language) data.language = 'en'
    if (!data.translationKey) data.translationKey = String(input.id)
  }
  if (locale === 'zh' && data.language === 'en') delete data.language

  if (creating) {
    const missing = ['title', 'date'].filter((key) => !data[key])
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

function toNoteRecord(
  path: string,
  sha: string,
  source: string,
  locale: Locale,
  includeBody = true
) {
  const document = parseMarkdownDocument(source, path)
  const id =
    noteIdFromPath(path, locale) ??
    path.slice(NOTES_ROOT.length + 1).replace(/\.(?:en\.)?(?:md|mdx)$/, '')
  const translationKey =
    typeof document.data.translationKey === 'string' ? document.data.translationKey : id

  return {
    type: 'note' as const,
    id,
    locale,
    path,
    version: sha,
    url: locale === 'zh' ? `/notes/${id}` : `/en/notes/${translationKey}`,
    ...document.data,
    ...(includeBody ? { body: document.body } : {})
  } as NoteRecord
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

export function parseNoteCreateInput(value: Record<string, unknown>): NoteInput {
  return {
    ...value,
    id: readSlug(value.id),
    locale: parseLocale(value.locale)
  }
}
