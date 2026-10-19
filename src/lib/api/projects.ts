import {
  asRecord,
  compactObject,
  hasOwn,
  readBoolean,
  readEnum,
  readOptionalString,
  readOptionalUrl,
  readRequiredString,
  readSlug,
  readStringArray
} from './frontmatter'
import { getRepoFile, putRepoFile } from './github'
import { ApiError } from './http'
import type { RuntimeEnv } from './runtime'

const PROJECTS_PATH = 'src/data/projects.json'
const STATUSES = ['active', 'paused', 'archived'] as const

export interface Project {
  id: string
  name: string
  status: (typeof STATUSES)[number]
  stack: string[]
  repo?: string
  demo?: string
  featured?: boolean
  image?: string
  zh: { description: string }
  en: { description: string }
}

export interface ProjectRecord extends Project {
  type: 'project'
  path: string
  version: string
}

export async function listProjects(env: RuntimeEnv): Promise<ProjectRecord[]> {
  const state = await readProjects(env)
  return state.projects.map((project) => ({
    type: 'project',
    path: PROJECTS_PATH,
    version: state.sha,
    ...project
  }))
}

export async function getProject(env: RuntimeEnv, id: string): Promise<ProjectRecord | null> {
  const state = await readProjects(env)
  const project = state.projects.find((entry) => entry.id === id)
  return project
    ? {
        type: 'project',
        path: PROJECTS_PATH,
        version: state.sha,
        ...project
      }
    : null
}

export async function createProject(env: RuntimeEnv, input: Record<string, unknown>) {
  const state = await readProjects(env)
  const project = normalizeProject(input, true)
  if (state.projects.some((entry) => entry.id === project.id)) {
    throw new ApiError(409, 'ALREADY_EXISTS', `Project "${project.id}" already exists.`)
  }

  const projects = [...state.projects, project]
  const content = stringifyProjects(projects)
  const result = await putRepoFile(
    env,
    PROJECTS_PATH,
    content,
    `content(project): create ${project.id}`,
    state.sha
  )

  return {
    record: {
      type: 'project' as const,
      path: PROJECTS_PATH,
      version: result.sha,
      ...project
    },
    commit: result.commit
  }
}

export async function updateProject(env: RuntimeEnv, id: string, input: Record<string, unknown>) {
  const state = await readProjects(env)
  const index = state.projects.findIndex((entry) => entry.id === id)
  if (index === -1) return null
  if (hasOwn(input, 'id') && input.id !== id) {
    throw new ApiError(400, 'IMMUTABLE_ID', 'Project id cannot be changed.')
  }

  const merged = normalizeProject(
    {
      ...state.projects[index],
      ...input
    },
    false
  )
  if (merged.id !== id) {
    throw new ApiError(400, 'IMMUTABLE_ID', 'Project id cannot be changed.')
  }

  const projects = [...state.projects]
  projects[index] = merged
  const content = stringifyProjects(projects)
  const result = await putRepoFile(
    env,
    PROJECTS_PATH,
    content,
    `content(project): update ${id}`,
    state.sha
  )

  return {
    record: {
      type: 'project' as const,
      path: PROJECTS_PATH,
      version: result.sha,
      ...merged
    },
    commit: result.commit
  }
}

export async function deleteProject(env: RuntimeEnv, id: string) {
  const state = await readProjects(env)
  const index = state.projects.findIndex((entry) => entry.id === id)
  if (index === -1) return null

  const projects = state.projects.filter((entry) => entry.id !== id)
  if (projects.length === 0) {
    const result = await putRepoFile(
      env,
      PROJECTS_PATH,
      '[]\n',
      `content(project): delete ${id}`,
      state.sha
    )
    return { removed: state.projects[index], commit: result.commit }
  }

  const result = await putRepoFile(
    env,
    PROJECTS_PATH,
    stringifyProjects(projects),
    `content(project): delete ${id}`,
    state.sha
  )
  return { removed: state.projects[index], commit: result.commit }
}

async function readProjects(env: RuntimeEnv) {
  const file = await getRepoFile(env, PROJECTS_PATH)
  if (!file) {
    throw new ApiError(
      500,
      'PROJECTS_FILE_MISSING',
      `${PROJECTS_PATH} does not exist on the configured GitHub branch.`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(file.content)
  } catch (error) {
    throw new ApiError(500, 'CONTENT_CORRUPT', `${PROJECTS_PATH} is not valid JSON.`, String(error))
  }
  if (!Array.isArray(parsed)) {
    throw new ApiError(500, 'CONTENT_CORRUPT', `${PROJECTS_PATH} must contain a JSON array.`)
  }

  return {
    sha: file.sha,
    projects: parsed.map((entry, index) =>
      normalizeProject(asRecord(entry, `projects[${index}]`), false)
    )
  }
}

function normalizeProject(value: Record<string, unknown>, creating: boolean): Project {
  const id = readSlug(value.id, 'id')
  const name = readRequiredString(value.name, 'name', { max: 100 })
  const status = readEnum(value.status, 'status', STATUSES)
  const stack = readStringArray(value.stack ?? [], 'stack', { maxItems: 20, maxLength: 40 })
  const repo = readOptionalUrl(value.repo, 'repo')
  const demo = readOptionalUrl(value.demo, 'demo')
  const featured =
    value.featured === undefined ? undefined : readBoolean(value.featured, 'featured')
  const image = readOptionalString(value.image, 'image', { max: 200 })
  const zh = asRecord(value.zh, 'zh')
  const en = asRecord(value.en, 'en')
  const zhDescription = readRequiredString(zh.description, 'zh.description', { max: 500 })
  const enDescription = readRequiredString(en.description, 'en.description', { max: 500 })

  if (creating && stack.length === 0) {
    throw new ApiError(400, 'MISSING_FIELD', 'stack must contain at least one item.')
  }

  return compactObject({
    id,
    name,
    status,
    stack,
    repo: repo ?? undefined,
    demo: demo ?? undefined,
    featured,
    image: image ?? undefined,
    zh: { description: zhDescription },
    en: { description: enDescription }
  }) as Project
}

function stringifyProjects(projects: Project[]) {
  return `${JSON.stringify(projects, null, 2)}\n`
}
