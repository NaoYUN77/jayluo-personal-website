import { ghostLines } from '@/data/ghost-lines'

type LineKey = Exclude<keyof typeof ghostLines.zh, 'click'> | 'click'
type GhostState = {
  sleeping: boolean
  clicks: number
  burst: number
  lastClick: number
  lastActivity: number
  line: LineKey | null
  choice: number
  shown: number
  expiresAt: number
  read: string[]
}
const storageKey = ['pixel', 'ghost', 'session', 'v1'].join('-')

export function initGhost() {
  const pet = document.querySelector<HTMLElement>('[data-ghost-pet]')
  const button = pet?.querySelector<HTMLButtonElement>('button')
  const speech = pet?.querySelector<HTMLElement>('[data-ghost-speech]')
  const live = pet?.querySelector<HTMLElement>('[data-ghost-live]')
  if (!pet || !button || !speech || !live || pet.dataset.ready) return
  pet.dataset.ready = 'true'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let state: GhostState = {
    sleeping: false,
    clicks: 0,
    burst: 0,
    lastClick: 0,
    lastActivity: Date.now(),
    line: null,
    choice: 0,
    shown: 0,
    expiresAt: 0,
    read: []
  }
  let returning = false
  try {
    returning = localStorage.getItem('pixel-ghost-visited') === 'true'
    localStorage.setItem('pixel-ghost-visited', 'true')
  } catch {}
  let restored = false
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    if (saved && typeof saved.sleeping === 'boolean' && Number.isFinite(saved.clicks)) {
      state = { ...state, ...saved }
      restored = true
    }
  } catch {
    /* Storage can be unavailable in private contexts. */
  }
  let lang: 'zh' | 'en' = location.pathname.match(/^\/en(?:\/|$)/) ? 'en' : 'zh'
  let idleTimer: ReturnType<typeof setTimeout>
  let speechTimer: ReturnType<typeof setTimeout> | undefined
  let actionTimer: ReturnType<typeof setTimeout> | undefined
  let path = ''
  const save = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {}
  }
  const text = () => {
    if (!state.line) return ''
    return state.line === 'click'
      ? ghostLines[lang].click[state.choice % ghostLines[lang].click.length]
      : ghostLines[lang][state.line]
  }
  const hideSpeech = () => {
    clearTimeout(speechTimer)
    state.line = null
    state.expiresAt = 0
    speech.textContent = ''
    live.textContent = ''
    pet.classList.remove('is-speaking')
    save()
  }
  const renderSpeech = () => {
    clearTimeout(speechTimer)
    if (!state.line || Date.now() >= state.expiresAt) {
      hideSpeech()
      return
    }
    const chars = Array.from(text())
    if (reduced.matches) state.shown = chars.length
    speech.textContent = chars.slice(0, state.shown).join('')
    pet.classList.add('is-speaking')
    if (state.shown < chars.length) {
      speechTimer = setTimeout(() => {
        state.shown++
        save()
        renderSpeech()
      }, 55)
    } else {
      // Announce a complete sentence, rather than every typewriter character.
      live.textContent = text()
      speechTimer = setTimeout(hideSpeech, Math.max(0, state.expiresAt - Date.now()))
    }
  }
  const say = (line: LineKey, choice = 0) => {
    state.line = line
    state.choice = choice
    state.shown = 0
    state.expiresAt = Date.now() + (reduced.matches ? 0 : Array.from(text()).length * 55) + 4000
    save()
    renderSpeech()
  }
  const sleep = () => {
    state.sleeping = true
    pet.classList.add('is-sleeping')
    hideSpeech()
    save()
  }
  const armIdle = () => {
    clearTimeout(idleTimer)
    if (!state.sleeping)
      idleTimer = setTimeout(sleep, Math.max(0, 60000 - (Date.now() - state.lastActivity)))
  }
  let lastSavedActivity = 0
  const wake = () => {
    const wasSleeping = state.sleeping
    state.sleeping = false
    state.lastActivity = Date.now()
    pet.classList.remove('is-sleeping')
    if (wasSleeping) say('awake')
    armIdle()
    if (wasSleeping || Date.now() - lastSavedActivity >= 1000) {
      lastSavedActivity = Date.now()
      save()
    }
  }
  const pageLoad = () => {
    const previousLang = lang
    lang = location.pathname.match(/^\/en(?:\/|$)/) ? 'en' : 'zh'
    const label = lang === 'en' ? 'Boo, the pixel ghost' : 'Boo，像素小幽灵'
    button.setAttribute('aria-label', label)
    button.title = label
    pet.dataset.lang = lang
    if (previousLang !== lang && state.line) {
      state.shown = 0
      state.expiresAt = Date.now() + Array.from(text()).length * 55 + 4000
      renderSpeech()
    }
    const current = location.pathname
    if (path === current) return
    const first = !path
    path = current
    const article = document.querySelector<HTMLElement>('#content')
    const isArticle = /^\/(?:en\/)?(?:blog|notes)\/[^/]+/.test(path) && !!article
    pet.dataset.article = isArticle ? 'true' : 'false'
    if (state.sleeping) return
    // Resume an in-progress sentence after a hard refresh.
    if (first && restored && state.line && state.expiresAt > Date.now()) {
      renderSpeech()
      return
    }
    if (document.body.dataset.pageKind === '404') say('missing')
    else if (/^\/(?:en\/)?projects\/?$/.test(path)) say('projects')
    else if (/^\/(?:en\/)?contact\/?$/.test(path)) say('contact')
    else if (isArticle && Array.from(article?.textContent?.trim() ?? '').length > 3000) say('long')
    else if (first) {
      const hour = new Date().getHours()
      say(hour >= 1 && hour <= 5 ? 'late' : returning ? 'returning' : 'welcome')
    }
    save()
  }
  const readEnd = () => {
    const wasSleeping = state.sleeping
    wake()
    if (wasSleeping) return
    if (pet.dataset.article !== 'true' || state.read.includes(path)) return
    const article = document.querySelector('#content')
    if (article && article.getBoundingClientRect().bottom <= innerHeight + 16) {
      state.read.push(path)
      say('finished')
    }
  }
  button.addEventListener('click', () => {
    const wasSleeping = state.sleeping
    wake()
    const now = Date.now()
    state.clicks++
    state.burst = now - state.lastClick <= 1500 ? state.burst + 1 : 1
    state.lastClick = now
    clearTimeout(actionTimer)
    pet.classList.remove('is-boo', 'is-escaping')
    // Restart the click animation even on rapid clicks.
    void button.offsetWidth
    if (state.burst >= 5) {
      state.burst = 0
      say('escape')
      pet.classList.add('is-escaping')
      actionTimer = setTimeout(() => pet.classList.remove('is-escaping'), 1800)
    } else {
      pet.classList.add('is-boo')
      if (!wasSleeping) say('click', Math.floor(Math.random() * ghostLines[lang].click.length))
      actionTimer = setTimeout(() => pet.classList.remove('is-boo'), 450)
    }
    save()
  })
  // Keep a sleeping ghost asleep through reload until actual user activity.
  pet.classList.toggle('is-sleeping', state.sleeping)
  pageLoad()
  armIdle()
  document.addEventListener('astro:page-load', pageLoad)
  document.addEventListener('pointermove', wake, { passive: true })
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!pet.contains(event.target as Node)) wake()
    },
    { passive: true }
  )
  document.addEventListener('keydown', (event) => {
    if (!(event.target === button && ['Enter', ' '].includes(event.key))) wake()
  })
  window.addEventListener('scroll', readEnd, { passive: true })
  window.addEventListener('pagehide', save)
  reduced.addEventListener('change', () => {
    if (state.line) renderSpeech()
  })
}
