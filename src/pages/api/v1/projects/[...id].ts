import type { APIRoute } from 'astro'
import { requireAuth } from '@/lib/api/auth'
import { ApiError, apiRoute, json, readJsonBody, success, triggerDeploy } from '@/lib/api/http'
import { deleteProject, getProject, updateProject } from '@/lib/api/projects'
import { getRuntime } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const project = await getProject(env, routeId(params.id))
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'Project not found.')
    return success(project)
  })

export const PATCH: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const result = await updateProject(
      env,
      routeId(params.id),
      await readJsonBody(request, 200_000)
    )
    if (!result) throw new ApiError(404, 'NOT_FOUND', 'Project not found.')

    return json({
      data: result.record,
      meta: {
        commit: result.commit,
        deployQueued: triggerDeploy(locals)
      }
    })
  })

export const DELETE: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const result = await deleteProject(env, routeId(params.id))
    if (!result) throw new ApiError(404, 'NOT_FOUND', 'Project not found.')
    triggerDeploy(locals)
    return new Response(null, { status: 204 })
  })

function routeId(value: string | undefined) {
  if (!value) throw new ApiError(400, 'MISSING_ID', 'Project id is required.')
  try {
    return decodeURIComponent(value)
  } catch {
    throw new ApiError(400, 'INVALID_ID', 'Project id is not valid URL encoding.')
  }
}
