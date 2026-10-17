import type { APIRoute } from 'astro'
import { defaultOgPng } from '@/lib/og'
import config from '@/site-config'

export const prerender = true

export const GET: APIRoute = async () => {
  const png = await defaultOgPng({
    name: config.author,
    tagline: config.description ?? ''
  })
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  })
}
