import type { R2BucketLike, R2ObjectBodyLike, R2ObjectLike } from './runtime'
import { ApiError } from './http'

export const AVATAR_KEY = 'profile/avatar'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

interface DetectedImage {
  contentType: ImageType
  extension: string
}

export async function readImageBody(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Image must be <= ${maxBytes} bytes.`)
  }

  const buffer = await request.arrayBuffer()
  if (buffer.byteLength === 0) {
    throw new ApiError(400, 'EMPTY_BODY', 'An image request body is required.')
  }
  if (buffer.byteLength > maxBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Image must be <= ${maxBytes} bytes.`)
  }

  return {
    bytes: buffer,
    image: detectImage(buffer)
  }
}

export async function uploadMedia(
  bucket: R2BucketLike,
  key: string,
  bytes: ArrayBuffer,
  image: DetectedImage,
  originalName?: string
) {
  const object = await bucket.put(key, bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: 'public, max-age=3600'
    },
    customMetadata: compactMetadata({
      uploadedAt: new Date().toISOString(),
      originalName
    })
  })
  return object
}

export async function uploadAvatar(bucket: R2BucketLike, bytes: ArrayBuffer, image: DetectedImage) {
  return bucket.put(AVATAR_KEY, bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: 'public, max-age=60, must-revalidate'
    },
    customMetadata: {
      category: 'avatar',
      uploadedAt: new Date().toISOString()
    }
  })
}

export function serveMedia(
  request: Request,
  object: R2ObjectBodyLike,
  options: { cacheControl?: string; fallbackContentType?: string } = {}
) {
  const etag = normalizeEtag(object)
  if (etagMatches(request.headers.get('if-none-match'), etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        etag,
        'cache-control': options.cacheControl ?? object.httpMetadata?.cacheControl ?? 'public, max-age=3600'
      }
    })
  }

  const headers = new Headers({
    'content-type': object.httpMetadata?.contentType ?? options.fallbackContentType ?? 'application/octet-stream',
    'content-length': String(object.size),
    etag,
    'cache-control': options.cacheControl ?? object.httpMetadata?.cacheControl ?? 'public, max-age=3600',
    'x-content-type-options': 'nosniff'
  })

  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: 200,
    headers
  })
}

export function mediaResponseData(requestUrl: string, key: string, object: R2ObjectLike) {
  return {
    key,
    url: mediaUrl(requestUrl, key),
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    version: object.httpEtag || `"${object.etag}"`,
    uploadedAt: object.uploaded.toISOString()
  }
}

export function avatarResponseData(requestUrl: string, object: R2ObjectLike) {
  return {
    url: new URL('/api/v1/avatar', requestUrl).href,
    key: AVATAR_KEY,
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    version: object.httpEtag || `"${object.etag}"`,
    uploadedAt: object.uploaded.toISOString()
  }
}

export function mediaUrl(requestUrl: string, key: string) {
  return new URL(`/api/v1/media/${encodeMediaKey(key)}`, requestUrl).href
}

export function normalizeMediaKey(value: string) {
  let key: string
  try {
    key = decodeURIComponent(value)
  } catch {
    throw new ApiError(400, 'INVALID_MEDIA_KEY', 'Media key is not valid URL encoding.')
  }

  if (
    key.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) ||
    key.includes('\\') ||
    key.includes('//')
  ) {
    throw new ApiError(400, 'INVALID_MEDIA_KEY', 'Media key contains invalid characters.')
  }

  const segments = key.split('/')
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    !key.startsWith('media/') ||
    key.startsWith(AVATAR_KEY)
  ) {
    throw new ApiError(
      400,
      'INVALID_MEDIA_KEY',
      'Media key must be a safe path under "media/" and cannot use the reserved profile prefix.'
    )
  }
  return key
}

export function normalizeMediaPrefix(value: string | null) {
  if (!value) return 'media/'
  const prefix = decodeURIComponent(value)
  if (
    prefix.length > 200 ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(prefix) ||
    prefix.includes('\\') ||
    prefix.includes('//') ||
    prefix.split('/').some((segment) => segment === '.' || segment === '..') ||
    !prefix.startsWith('media/')
  ) {
    throw new ApiError(400, 'INVALID_MEDIA_KEY', 'Media prefix must be a safe path under "media/".')
  }
  return prefix
}

export function generatedMediaKey(filename: string | null, image: DetectedImage) {
  const date = new Date()
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const base = (filename ?? 'image')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const name = base || 'image'
  const unique = crypto.randomUUID().slice(0, 8)
  return `media/${year}/${month}/${Date.now()}-${unique}-${name}.${image.extension}`
}

export function detectImage(buffer: ArrayBuffer): DetectedImage {
  const bytes = new Uint8Array(buffer)
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', extension: 'png' }
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: 'image/jpeg', extension: 'jpg' }
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return { contentType: 'image/gif', extension: 'gif' }
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' }
  }
  if (ascii(bytes, 4, 4) === 'ftyp' && ['avif', 'avis'].includes(ascii(bytes, 8, 4))) {
    return { contentType: 'image/avif', extension: 'avif' }
  }

  throw new ApiError(
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    'Only PNG, JPEG, GIF, WebP, and AVIF images are accepted.'
  )
}

export function encodeMediaKey(key: string) {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function normalizeEtag(object: R2ObjectLike) {
  return object.httpEtag || `"${object.etag}"`
}

function etagMatches(header: string | null, etag: string) {
  if (!header) return false
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === '*' || value === etag)
}

function compactMetadata(value: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => Boolean(entry[1]))
  )
}

function startsWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((byte, index) => bytes[index] === byte)
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}
