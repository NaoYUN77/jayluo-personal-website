export interface R2ObjectLike {
  key: string
  size: number
  etag: string
  httpEtag?: string
  uploaded: Date
  httpMetadata?: {
    contentType?: string
    cacheControl?: string
    contentDisposition?: string
  }
  customMetadata?: Record<string, string>
}

export interface R2ObjectBodyLike extends R2ObjectLike {
  body: ReadableStream
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: {
      httpMetadata?: R2ObjectLike['httpMetadata']
      customMetadata?: Record<string, string>
    }
  ): Promise<R2ObjectLike>
  delete(key: string | string[]): Promise<void>
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: R2ObjectLike[]
    truncated: boolean
    cursor?: string
  }>
}

export interface RuntimeEnv {
  ASSETS?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  }
  MEDIA?: R2BucketLike
  CONTENT_API_TOKEN?: string
  GITHUB_TOKEN?: string
  GITHUB_OWNER?: string
  GITHUB_REPO?: string
  GITHUB_BRANCH?: string
  GITHUB_API_BASE_URL?: string
  DEPLOY_HOOK_URL?: string
  MAX_MEDIA_BYTES?: string
  MAX_AVATAR_BYTES?: string
}

export interface RuntimeContext {
  env: RuntimeEnv
  ctx?: {
    waitUntil(promise: Promise<unknown>): void
  }
}

export function getRuntime(locals: App.Locals): RuntimeContext {
  return locals.runtime as RuntimeContext
}

export function runtimeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}
