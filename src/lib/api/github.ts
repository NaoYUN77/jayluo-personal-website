import { ApiError } from './http'
import type { RuntimeEnv } from './runtime'

export interface GitHubFile {
  path: string
  sha: string
  content: string
  htmlUrl?: string
}

interface GitHubConfig {
  owner: string
  repo: string
  branch: string
  token: string
  apiBaseUrl: string
}

interface GitHubContentResponse {
  type?: string
  path?: string
  sha?: string
  content?: string
  html_url?: string
}

interface GitHubWriteResponse {
  content?: { sha?: string }
  commit?: { sha?: string }
}

interface GitHubTreeResponse {
  truncated?: boolean
  tree?: Array<{ path?: string; type?: string }>
}

export function getGitHubConfig(env: RuntimeEnv): GitHubConfig {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new ApiError(
      503,
      'GITHUB_NOT_CONFIGURED',
      'GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO must be configured.'
    )
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(env.GITHUB_OWNER) || !/^[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPO)) {
    throw new ApiError(503, 'GITHUB_NOT_CONFIGURED', 'GitHub owner or repository name is invalid.')
  }

  const apiBaseUrl = (env.GITHUB_API_BASE_URL || 'https://api.github.com').replace(/\/+$/, '')
  try {
    const parsed = new URL(apiBaseUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol')
  } catch {
    throw new ApiError(503, 'GITHUB_NOT_CONFIGURED', 'GITHUB_API_BASE_URL must be an HTTP(S) URL.')
  }

  return {
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH || 'main',
    token: env.GITHUB_TOKEN,
    apiBaseUrl
  }
}

export async function getRepoFile(env: RuntimeEnv, path: string): Promise<GitHubFile | null> {
  const config = getGitHubConfig(env)
  const response = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`
  )

  if (response.status === 404) return null
  await assertGitHubResponse(response)

  const data = (await response.json()) as GitHubContentResponse
  if (data.type !== 'file' || !data.sha || !data.content) {
    throw new ApiError(502, 'GITHUB_INVALID_RESPONSE', `GitHub did not return file contents for ${path}.`)
  }

  return {
    path: data.path || path,
    sha: data.sha,
    content: decodeBase64(data.content),
    htmlUrl: data.html_url
  }
}

export async function putRepoFile(
  env: RuntimeEnv,
  path: string,
  content: string,
  message: string,
  sha?: string
) {
  const config = getGitHubConfig(env)
  const response = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: encodeBase64(content),
        branch: config.branch,
        ...(sha ? { sha } : {})
      })
    }
  )
  await assertGitHubResponse(response)

  const data = (await response.json()) as GitHubWriteResponse
  return {
    sha: data.content?.sha ?? '',
    commit: data.commit?.sha ?? ''
  }
}

export async function deleteRepoFile(
  env: RuntimeEnv,
  path: string,
  message: string,
  sha: string
) {
  const config = getGitHubConfig(env)
  const response = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}`,
    {
      method: 'DELETE',
      body: JSON.stringify({
        message,
        sha,
        branch: config.branch
      })
    }
  )
  await assertGitHubResponse(response)
}

export async function listRepoPaths(env: RuntimeEnv, prefix: string) {
  const config = getGitHubConfig(env)
  const response = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/git/trees/${encodeURIComponent(config.branch)}?recursive=1`
  )
  await assertGitHubResponse(response)

  const data = (await response.json()) as GitHubTreeResponse
  if (data.truncated) {
    throw new ApiError(502, 'GITHUB_TREE_TRUNCATED', 'The repository tree is too large for the GitHub API.')
  }

  return (data.tree ?? [])
    .filter((entry) => entry.type === 'blob' && entry.path?.startsWith(prefix))
    .map((entry) => entry.path!)
}

async function githubRequest(
  config: GitHubConfig,
  endpoint: string,
  init: RequestInit = {}
) {
  try {
    return await fetch(`${config.apiBaseUrl}${endpoint}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
        'user-agent': 'jayluo-blog-content-api',
        'x-github-api-version': '2022-11-28',
        ...init.headers
      }
    })
  } catch (error) {
    console.error('[github] request failed', error)
    throw new ApiError(502, 'GITHUB_UNAVAILABLE', 'Could not reach the GitHub API.')
  }
}

async function assertGitHubResponse(response: Response) {
  if (response.ok) return

  let details: unknown
  try {
    details = await response.json()
  } catch {
    details = undefined
  }

  const rateLimited =
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')

  if (rateLimited) {
    throw new ApiError(
      503,
      'GITHUB_RATE_LIMITED',
      'GitHub API rate limit reached. Retry after the reset time.',
      details
    )
  }
  if (response.status === 409 || response.status === 422) {
    throw new ApiError(
      409,
      'CONTENT_CONFLICT',
      'The content changed while this request was being processed. Retry with fresh data.',
      details
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(
      502,
      'GITHUB_AUTH_FAILED',
      'GitHub rejected the configured token or it lacks repository contents access.'
    )
  }
  if (response.status === 404) {
    throw new ApiError(
      404,
      'GITHUB_NOT_FOUND',
      'The configured GitHub repository, branch, or file was not found.',
      details
    )
  }

  throw new ApiError(
    502,
    'GITHUB_REQUEST_FAILED',
    `GitHub API returned HTTP ${response.status}.`,
    details
  )
}

function encodePath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}
