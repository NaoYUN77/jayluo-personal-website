import type { GhostCameo } from '@/data/ghost-lines'

export type GhostBox = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}
export type GhostPoint = { x: number; y: number }
export function boxesOverlap(a: GhostBox, b: GhostBox, gap = 6) {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  )
}
export function safeGhostPoint(
  point: GhostPoint,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  blocked: GhostBox[]
) {
  const box = {
    left: point.x,
    top: point.y,
    right: point.x + width,
    bottom: point.y + height,
    width,
    height
  }
  return (
    box.left >= 8 &&
    box.right <= viewport.width - 8 &&
    box.top >= 48 &&
    box.bottom <= viewport.height - 8 &&
    !blocked.some((rect) => boxesOverlap(box, rect))
  )
}

export function createGhostActivity(
  pet: HTMLElement,
  options: {
    disabled: () => boolean
    home: () => boolean
    used: () => string[]
    count: () => number
    cameo: (kind: GhostCameo, choice: number) => void
    interrupt: () => void
    lineCount: (kind: GhostCameo) => number
  }
) {
  let current: GhostPoint | null = null
  let scrollingUntil = 0
  let entered = Date.now()
  let nextCameo = Date.now() + 12000
  let nextRoam = Date.now() + 10000 + Math.random() * 10000
  let returnTimer: ReturnType<typeof setTimeout> | undefined
  let lookTimer: ReturnType<typeof setTimeout> | undefined
  let activeCameo = false
  let shyUntil = 0
  const visibleSince = new Map<string, number>()
  const selecting = () => !!window.getSelection()?.toString().trim()
  const size = () => ({ width: pet.offsetWidth, height: pet.offsetHeight })
  const blocked = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,[contenteditable="true"],[data-copy-code]'
      )
    ]
      .filter((node) => !pet.contains(node))
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.bottom > 0 && rect.top < innerHeight && rect.width > 0)
  const clearPosition = () => {
    pet.classList.remove('is-positioned', 'is-roaming', 'is-looking', 'is-cameo', 'is-obstructed')
    pet.style.removeProperty('--ghost-x')
    pet.style.removeProperty('--ghost-y')
    current = null
  }
  const place = (point: GhostPoint, animate = false) => {
    pet.classList.add('is-positioned')
    pet.classList.toggle('is-roaming', animate)
    pet.style.setProperty('--ghost-x', `${point.x}px`)
    pet.style.setProperty('--ghost-y', `${point.y}px`)
    current = point
  }
  const corner = () => {
    if (options.home()) {
      clearPosition()
      return
    }
    const { width, height } = size()
    const buttons = document.querySelector('#action-buttons')?.getBoundingClientRect()
    const bottom =
      buttons && buttons.top < innerHeight ? Math.max(16, innerHeight - buttons.top + 14) : 16
    const candidates = [
      { x: innerWidth - width - 12, y: innerHeight - height - bottom },
      { x: innerWidth - width - 12, y: innerHeight - height - 16 },
      { x: innerWidth - width - (innerWidth < 640 ? 76 : 100), y: innerHeight - height - 16 }
    ]
    const obstacles = blocked()
    const point = candidates.find((point) =>
      safeGhostPoint(point, width, height, { width: innerWidth, height: innerHeight }, obstacles)
    )
    pet.classList.remove('is-roaming', 'is-looking', 'is-cameo')
    pet.classList.toggle('is-obstructed', !point)
    if (point) place(point)
  }
  const cancel = () => {
    clearTimeout(returnTimer)
    clearTimeout(lookTimer)
    activeCameo = false
    nextRoam = Date.now() + 10000 + Math.random() * 10000
    options.interrupt()
    corner()
  }
  const contentRight = () => {
    const rects = [...document.querySelectorAll<HTMLElement>('main,.prose')]
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0)
    return rects.length ? Math.max(...rects.map((rect) => rect.right)) : innerWidth
  }
  const canMove = () =>
    !options.home() &&
    !options.disabled() &&
    !document.querySelector('dialog[open]') &&
    !document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') &&
    !document.documentElement.classList.contains('boot-running') &&
    !selecting() &&
    Date.now() >= scrollingUntil
  const rail = () => {
    const { width } = size()
    const start = contentRight() + 12
    return innerWidth >= 1200 && start + width + 12 <= innerWidth ? start : null
  }
  const safe = (point: GhostPoint) => {
    const { width, height } = size()
    return safeGhostPoint(
      point,
      width,
      height,
      { width: innerWidth, height: innerHeight },
      blocked()
    )
  }
  const visible = (node: Element | null) => {
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return rect.bottom > 80 && rect.top < innerHeight - 80 && rect.width > 0 ? rect : null
  }
  const tryCameo = () => {
    if (innerWidth < 900 || options.count() >= 2 || activeCameo || Date.now() < nextCameo)
      return false
    const article = pet.dataset.article === 'true'
    const content = document.querySelector('#content')
    const end = article && content && content.getBoundingClientRect().bottom <= innerHeight + 16
    const candidates: { kind: GhostCameo; node: Element | null }[] = []
    if (end) candidates.push({ kind: 'end', node: content })
    if (article && Date.now() - entered >= 20000)
      candidates.push({ kind: 'title', node: document.querySelector('#content-header h1') })
    if (article) {
      candidates.push({
        kind: 'code',
        node: [...document.querySelectorAll('#content pre')].find((node) => visible(node)) ?? null
      })
      candidates.push({
        kind: 'image',
        node: [...document.querySelectorAll('#content img')].find((node) => visible(node)) ?? null
      })
    }
    if (window.scrollY > Math.max(0, document.documentElement.scrollHeight - innerHeight) / 2)
      candidates.push({ kind: 'top', node: document.querySelector('#to-top-btn') })
    if (!article) {
      const link = document.querySelector('#sidebar a[href*="/tags/"]')
      candidates.push({ kind: 'tags', node: link?.parentElement?.closest('#sidebar') ?? link })
    }
    for (const { kind, node } of candidates) {
      const rect = kind === 'top' && node ? node.getBoundingClientRect() : visible(node)
      if (!rect) {
        visibleSince.delete(kind)
        continue
      }
      if (!visibleSince.has(kind)) {
        visibleSince.set(kind, Date.now())
        continue
      }
      if (Date.now() - visibleSince.get(kind)! < 2500) continue
      const choices = Array.from({ length: options.lineCount(kind) }, (_, i) => i).filter(
        (i) => !options.used().includes(`${kind}:${i}`)
      )
      if (!choices.length) continue
      const { width, height } = size()
      let point = {
        x: rect.right + 12,
        y: Math.max(64, Math.min(rect.top + 8, innerHeight - height - 16))
      }
      if (kind === 'top')
        point = {
          x: Math.min(innerWidth - width - 12, rect.left + (rect.width - width) / 2),
          y: rect.top - height - 8
        }
      if (kind === 'end') {
        if (rail() === null) continue
        corner()
        const buttons = document.querySelector('#action-buttons')?.getBoundingClientRect()
        const bottom = {
          x: buttons ? buttons.left - width - 12 : innerWidth - width - 12,
          y: innerHeight - height - 12
        }
        point = bottom.x >= rail()! && safe(bottom) ? bottom : current!
      }
      if (!point || !safe(point)) continue
      activeCameo = true
      nextCameo = Date.now() + 16000
      pet.dataset.cameo = kind
      place(point)
      pet.classList.add('is-cameo')
      options.cameo(kind, choices[Math.floor(Math.random() * choices.length)])
      returnTimer = setTimeout(() => {
        activeCameo = false
        corner()
      }, 1800)
      return true
    }
    return false
  }
  const roam = () => {
    const start = rail()
    if (start === null || !current) return
    const { width, height } = size()
    const point =
      Math.random() < 0.5
        ? { x: start + Math.random() * Math.max(0, innerWidth - width - 12 - start), y: current.y }
        : { x: current.x, y: Math.max(64, innerHeight - height - 260) + Math.random() * 120 }
    if (!safe(point)) return
    const swept = {
      left: Math.min(current.x, point.x),
      top: Math.min(current.y, point.y),
      right: Math.max(current.x, point.x) + width,
      bottom: Math.max(current.y, point.y) + height,
      width,
      height
    }
    if (point.x < start || current.x < start || blocked().some((rect) => boxesOverlap(swept, rect)))
      return
    place(point, true)
    lookTimer = setTimeout(() => {
      pet.classList.add('is-looking')
      lookTimer = setTimeout(() => pet.classList.remove('is-looking'), 2000)
    }, 2000)
  }
  const protect = () => {
    const bubble = pet.querySelector('[data-ghost-bubble]')?.getBoundingClientRect()
    pet.classList.toggle(
      'hide-bubble',
      !options.home() &&
        !!bubble &&
        (bubble.top < 8 ||
          bubble.left < 8 ||
          bubble.right > innerWidth - 8 ||
          blocked().some((rect) => boxesOverlap(bubble, rect)))
    )
  }
  const pulse = () => {
    if (
      !options.home() &&
      !activeCameo &&
      (pet.classList.contains('is-obstructed') || (current && !safe(current)))
    )
      corner()
    protect()
    if (!canMove()) return
    if (!tryCameo() && !activeCameo && Date.now() >= nextRoam) {
      nextRoam = Date.now() + 10000 + Math.random() * 10000
      roam()
    }
  }
  const reset = () => {
    entered = Date.now()
    nextCameo = Date.now() + 12000
    visibleSince.clear()
    nextRoam = Date.now() + 10000 + Math.random() * 10000
    cancel()
  }
  const onScroll = () => {
    scrollingUntil = Date.now() + 1400
    visibleSince.clear()
    cancel()
  }
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('resize', reset)
  document.addEventListener('focusin', (event) => {
    if (!pet.contains(event.target as Node)) cancel()
  })
  document.addEventListener('selectionchange', () => {
    if (selecting()) cancel()
  })
  document.addEventListener(
    'pointermove',
    (event) => {
      if (
        !canMove() ||
        rail() === null ||
        activeCameo ||
        !current ||
        Date.now() < shyUntil ||
        pet.contains(event.target as Node)
      )
        return
      const { width, height } = size()
      const actual = pet.getBoundingClientRect()
      if (
        Math.hypot(
          event.clientX - actual.left - width / 2,
          event.clientY - actual.top - height / 2
        ) > 80
      )
        return
      shyUntil = Date.now() + 3000
      const point = { x: actual.left, y: Math.max(64, actual.top - 48) }
      if (safe(point)) place(point, true)
    },
    { passive: true }
  )
  setInterval(pulse, 1000)
  return { reset, cancel, protect }
}
