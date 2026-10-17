import type { APIRoute } from 'astro'

import { requireAuth } from '@/lib/api/auth'
import {
  ApiError,
  apiRoute,
  json,
  parseBoolean,
  parseLocale,
  readJsonBody,
  success,
  triggerDeploy
} from '@/lib/api/http'
import { deleteNote, getNote, updateNote } from '@/lib/api/notes'
import { getRuntime } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const url = new URL(request.url)
    const locale = parseLocale(url.searchParams.get('locale'))
    const includeBody = parseBoolean(url.searchParams.get('includeBody'), true)
    const record = await getNote(env, routeId(params.id), locale, includeBody)
    if (!record) throw new ApiError(404, 'NOT_FOUND', 'Note not found.')
    return success(record)
  })

export const PATCH: APIRoute = async ({ request, locals, params }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const url = new URL(request.url)
    const locale = parseLocale(url.searchParams.get('locale'))
    const result = await updateNote(
      env,
      routeId(params.id),
      locale,
      await readJsonBody(request, 1_000_000)
    )
    if (!result) throw new ApiError(404, 'NOT_FOUND', 'Note not found.')

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

    const url = new URL(request.url)
    const locale = parseLocale(url.searchParams.get('locale'))
    const result = await deleteNote(env, routeId(params.id), locale)
    if (!result) throw new ApiError(404, 'NOT_FOUND', 'Note not found.')
    triggerDeploy(locals)
    return new Response(null, { status: 204 })
  })

function routeId(value: string | undefined) {
  if (!value) throw new ApiError(400, 'MISSING_ID', 'Note id is required.')
  try {
    return decodeURIComponent(value)
  } catch {
    throw new ApiError(400, 'INVALID_ID', 'Note id is not valid URL encoding.')
  }
}
