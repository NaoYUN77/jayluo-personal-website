import { parse, stringify } from 'yaml'

import { ApiError } from './http'

export interface MarkdownDocument {
  data: Record<string, unknown>
  body: string
}

export function parseMarkdownDocument(source: string, path: string): MarkdownDocument {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/)
  if (!match) {
    throw new ApiError(422, 'INVALID_FRONTMATTER', `${path} does not contain YAML frontmatter.`)
  }

  let data: unknown
  try {
    data = parse(match[1], { schema: 'core' })
  } catch (error) {
    throw new ApiError(422, 'INVALID_FRONTMATTER', `${path} contains invalid YAML.`, String(error))
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(422, 'INVALID_FRONTMATTER', `${path} frontmatter must be a YAML object.`)
  }

  return {
    data: data as Record<string, unknown>,
    body: match[2].replace(/^\n+/, '').replace(/\s+$/, '') + '\n'
  }
}

export function serializeMarkdownDocument(document: MarkdownDocument) {
  const frontmatter = stringify(document.data, {
    lineWidth: 0,
    minContentWidth: 0
  }).trimEnd()
  const body = document.body.replace(/\r\n/g, '\n').replace(/\s+$/, '')
  return `---\n${frontmatter}\n---\n\n${body}\n`
}

export function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T
}

export function removeNullFields(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null))
}

export function asRecord(value: unknown, field = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be an object.`)
  }
  return value as Record<string, unknown>
}

export function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function readRequiredString(
  value: unknown,
  field: string,
  options: { max?: number; trim?: boolean } = {}
) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be a string.`)
  }
  const result = options.trim === false ? value : value.trim()
  if (!result) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must not be empty.`)
  }
  if (options.max && result.length > options.max) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be <= ${options.max} characters.`)
  }
  return result
}

export function readOptionalString(
  value: unknown,
  field: string,
  options: { max?: number; trim?: boolean } = {}
) {
  if (value === undefined || value === null) return value
  return readRequiredString(value, field, options)
}

export function readDate(value: unknown, field: string) {
  const text = readRequiredString(value, field, { max: 40 })
  if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be an ISO date such as 2026-10-17.`)
  }
  return text
}

export function readOptionalDate(value: unknown, field: string) {
  if (value === undefined || value === null) return value
  return readDate(value, field)
}

export function readBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be a boolean.`)
  }
  return value
}

export function readStringArray(
  value: unknown,
  field: string,
  options: { maxItems?: number; maxLength?: number } = {}
) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be an array of strings.`)
  }
  if (options.maxItems && value.length > options.maxItems) {
    throw new ApiError(
      400,
      'INVALID_FIELD',
      `${field} must contain at most ${options.maxItems} items.`
    )
  }

  const normalized = value.map((item) => {
    const text = readRequiredString(item, field, { max: options.maxLength }).toLowerCase()
    if (text.includes(',')) {
      throw new ApiError(400, 'INVALID_FIELD', `${field} items must not contain commas.`)
    }
    return text
  })
  return [...new Set(normalized)]
}

export function readEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
) {
  const text = readRequiredString(value, field)
  if (!allowed.includes(text as T)) {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be one of: ${allowed.join(', ')}.`)
  }
  return text as T
}

export function readSlug(value: unknown, field = 'id') {
  const text = readRequiredString(value, field, { max: 96 })
  if (
    !/^[a-z0-9][a-z0-9-]*$/.test(text) ||
    text.endsWith('-') ||
    text.includes('..')
  ) {
    throw new ApiError(
      400,
      'INVALID_ID',
      `${field} must use lowercase letters, numbers, and hyphens.`
    )
  }
  return text
}

export function readUrl(value: unknown, field: string) {
  const text = readRequiredString(value, field, { max: 500 })
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol')
  } catch {
    throw new ApiError(400, 'INVALID_FIELD', `${field} must be an absolute HTTP(S) URL.`)
  }
  return text
}

export function readOptionalUrl(value: unknown, field: string) {
  if (value === undefined || value === null) return value
  return readUrl(value, field)
}

export function assertBody(value: unknown, maxBytes = 800_000) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_FIELD', 'body must be a string.')
  }
  if (new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `body must be <= ${maxBytes} bytes.`)
  }
  return value
}
