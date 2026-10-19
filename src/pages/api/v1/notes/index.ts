import type { APIRoute } from 'astro'
import { requireAuth } from '@/lib/api/auth'
import {
  apiRoute,
  json,
  parseBoolean,
  parseDraftMode,
  parseInteger,
  parseLocale,
  readJsonBody,
  successList,
  triggerDeploy
} from '@/lib/api/http'
import { createNote, listNotes, parseNoteCreateInput } from '@/lib/api/notes'
import { getRuntime } from '@/lib/api/runtime'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const url = new URL(request.url)
    const locale = parseLocale(url.searchParams.get('locale'))
    const limit = parseInteger(url.searchParams.get('limit'), 20, 1, 50)
    const offset = parseInteger(url.searchParams.get('offset'), 0, 0, 10_000)
    const includeBody = parseBoolean(url.searchParams.get('includeBody'), false)
    const records = await listNotes(env, locale, {
      includeBody,
      drafts: parseDraftMode(url.searchParams.get('draft')),
      limit,
      offset
    })

    return successList(records, { locale, count: records.length, limit, offset })
  })

export const POST: APIRoute = async ({ request, locals }) =>
  apiRoute(async () => {
    const { env } = getRuntime(locals)
    await requireAuth(request, env)

    const input = parseNoteCreateInput(await readJsonBody(request, 1_000_000))
    const result = await createNote(env, input)
    const deployQueued = triggerDeploy(locals)
    const location = new URL(
      `/api/v1/notes/${encodeURIComponent(result.record.id)}?locale=${input.locale}`,
      request.url
    ).href

    return json(
      {
        data: result.record,
        meta: {
          commit: result.commit,
          deployQueued
        }
      },
      {
        status: 201,
        headers: { location }
      }
    )
  })
