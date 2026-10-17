import type { APIRoute } from 'astro'

import { requireAuth } from '@/lib/api/auth'
import {
  apiRoute,
  json,
  readJsonBody,
  successList,
  triggerDeploy
} from '@/lib/api/http'
import { createProject, listProjects } from '@/lib/api/projects'
import { getRuntime } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)
    const projects = await listProjects(env)
    return successList(projects, { count: projects.length })
  })

export const POST: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const result = await createProject(env, await readJsonBody(request, 200_000))
    const location = new URL(
      `/api/v1/projects/${encodeURIComponent(result.record.id)}`,
      request.url
    ).href

    return json(
      {
        data: result.record,
        meta: {
          commit: result.commit,
          deployQueued: triggerDeploy(locals)
        }
      },
      {
        status: 201,
        headers: { location }
      }
    )
  })
