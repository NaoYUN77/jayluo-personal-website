import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/lib/ghost.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs'
})
const key = ['pixel', 'ghost', 'session', 'v1'].join('-')
function mount({
  session = new Map(),
  local = new Map(),
  pathname = '/',
  reduced = false,
  article = null,
  missing = false,
  hero = false,
  width = 1600,
  backToTop = false,
  pageNodes = {},
  pageLists = {},
  boot = false
} = {}) {
  let now = new Date('2026-11-13T12:00:00').getTime()
  let id = 0
  const timers = new Map()
  class Element extends EventTarget {
    dataset = {}
    attrs = {}
    textContent = ''
    offsetWidth = 100
    offsetHeight = 110
    style = {
      setProperty(key, value) {
        this[key] = value
      },
      removeProperty(key) {
        delete this[key]
      }
    }
    classes = new Set()
    classList = {
      add: (...names) => names.forEach((n) => this.classes.add(n)),
      remove: (...names) => names.forEach((n) => this.classes.delete(n)),
      contains: (name) => this.classes.has(name),
      toggle: (name, force) => {
        if (force ?? !this.classes.has(name)) this.classes.add(name)
        else this.classes.delete(name)
      }
    }
    setAttribute(k, v) {
      this.attrs[k] = v
    }
    removeAttribute(key) {
      delete this.attrs[key]
    }
    contains(el) {
      return (
        el === this ||
        (this === pet && [button, speech, live, bubble, quietButton].includes(el)) ||
        (this === bubble && [speech, quietButton].includes(el))
      )
    }
    getBoundingClientRect() {
      if (this.box) return this.box
      const left = parseFloat(this.style['--ghost-x'] ?? width - 112),
        top = parseFloat(this.style['--ghost-y'] ?? 674)
      return {
        left,
        top,
        width: this.offsetWidth,
        height: this.offsetHeight,
        right: left + this.offsetWidth,
        bottom: top + this.offsetHeight
      }
    }
  }
  const pet = new Element(),
    button = new Element(),
    speech = new Element(),
    live = new Element(),
    bubble = new Element(),
    quietButton = new Element()
  bubble.box = {
    left: width - 300,
    top: 400,
    right: width - 20,
    bottom: 550,
    width: 280,
    height: 150
  }
  const main = new Element()
  main.box = {
    left: 80,
    top: 100,
    right: width - 240,
    bottom: 1200,
    width: width - 320,
    height: 1100
  }
  const heading = new Element()
  heading.box = {
    left: 80,
    top: 220,
    right: width - 240,
    bottom: 270,
    width: width - 320,
    height: 50
  }
  const topButton = new Element()
  topButton.box = {
    left: width - 80,
    top: 720,
    right: width - 32,
    bottom: 768,
    width: 48,
    height: 48
  }
  const dock = new Element()
  const fixtureLines = [
    { text: 'boo! Welcome! I am Boo' },
    { text: 'Latest save: A real post', href: '/blog/real/post' },
    { text: '2 posts, 3 notes, 4 projects' },
    { text: 'Use arrows and Enter' },
    { text: 'Visit About', href: '/about' }
  ]
  dock.dataset.heroLines = JSON.stringify(fixtureLines)
  const nodes = {
    button,
    '[data-ghost-speech]': speech,
    '[data-ghost-live]': live,
    '[data-ghost-bubble]': bubble,
    '[data-ghost-quiet]': quietButton
  }
  pet.querySelector = (selector) => nodes[selector] ?? null
  const doc = new EventTarget()
  doc.body = { dataset: { pageKind: missing ? '404' : undefined } }
  doc.documentElement = new Element()
  doc.documentElement.scrollHeight = 2400
  if (boot) doc.documentElement.classList.add('boot-running')
  doc.querySelector = (selector) => {
    if (selector in pageNodes) return pageNodes[selector]
    if (selector === '[data-ghost-pet]') return pet
    if (selector === '[data-ghost-dock]')
      return hero && /^\/(?:en\/?)?$/.test(location.pathname) ? dock : null
    if (selector === '#content') return article
    if (selector === '#content-header h1') return article ? heading : null
    if (['#action-buttons', '#to-top-btn'].includes(selector)) return backToTop ? topButton : null
    return null
  }
  doc.querySelectorAll = (selector) => {
    if (selector in pageLists) return pageLists[selector]
    if (selector === 'main,.prose') return [main]
    if (selector.startsWith('a[href],button,') && backToTop) return [topButton]
    return []
  }
  let selection = ''
  const win = new EventTarget()
  win.getSelection = () => ({ toString: () => selection })
  win.scrollY = 0
  const location = { pathname }
  const storage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value)
  })
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]))
    }
    static now() {
      return now
    }
  }
  const media = new EventTarget()
  media.matches = reduced
  const context = {
    document: doc,
    window: win,
    location,
    sessionStorage: storage(session),
    localStorage: storage(local),
    Date: Clock,
    matchMedia: () => media,
    innerHeight: 800,
    innerWidth: width,
    Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
    setInterval: (fn, delay) => {
      const next = ++id
      timers.set(next, { fn, at: now + delay, interval: delay })
      return next
    },
    module: { exports: {} },
    setTimeout: (fn, delay) => {
      const next = ++id
      timers.set(next, { fn, at: now + delay })
      return next
    },
    clearTimeout: (id) => timers.delete(id)
  }
  vm.runInNewContext(bundle.outputFiles[0].text, context)
  context.module.exports.initGhost()
  function tick(ms) {
    const end = now + ms
    for (;;) {
      const next = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at
      timers.delete(next[0])
      next[1].fn()
      if (next[1].interval) timers.set(next[0], { ...next[1], at: now + next[1].interval })
    }
    now = end
  }
  const state = () => JSON.parse(session.get(key))
  const page = (next) => {
    location.pathname = next
    doc.dispatchEvent(new Event('astro:page-load'))
  }
  const click = () => button.dispatchEvent(new Event('click'))
  return {
    pet,
    button,
    speech,
    doc,
    win,
    location,
    state,
    tick,
    click,
    page,
    session,
    local,
    Element,
    bubble,
    quietButton,
    main,
    select: (text) => {
      selection = text
      doc.dispatchEvent(new Event('selectionchange'))
    }
  }
}

test('typewriter finishes then hides after four seconds; visitor greeting changes', () => {
  const x = mount()
  assert.equal(x.state().line, 'welcome')
  x.tick(55)
  assert.equal(x.speech.textContent, 'b')
  x.tick(2000)
  assert.equal(x.speech.textContent, 'boo! 欢迎来玩')
  x.tick(4000)
  assert.equal(x.state().line, null)
  const y = mount({ local: x.local })
  assert.equal(y.state().line, 'returning')
})

test('same pet survives route changes and changes locale/project/404 lines', () => {
  const x = mount()
  x.click()
  const count = x.state().clicks
  x.page('/en/projects')
  assert.equal(x.state().line, 'projects')
  assert.equal(x.button.attrs['aria-label'], 'Boo, the pixel ghost')
  assert.equal(x.state().clicks, count)
  x.tick(3000)
  assert.equal(x.speech.textContent, 'Here is what the author is working on. Take a look')
  x.page('/en/contact')
  assert.equal(x.state().line, 'contact')
  x.tick(2000)
  assert.equal(x.speech.textContent, 'Have an idea? Send an email')
  x.doc.body.dataset.pageKind = '404'
  x.page('/en/missing')
  assert.equal(x.state().line, 'missing')
})

test('five rapid clicks escape; click count and active dialogue restore on reload', () => {
  const x = mount()
  for (let i = 0; i < 5; i++) x.click()
  assert.equal(x.state().clicks, 5)
  assert.equal(x.state().line, 'escape')
  assert(x.pet.classes.has('is-escaping'))
  const y = mount({ session: x.session, local: x.local })
  assert.equal(y.state().clicks, 5)
  assert.equal(y.state().line, 'escape')
  x.tick(1800)
  assert(!x.pet.classes.has('is-escaping'))
})

test('idle sleep restores, activity wakes it, and reduced motion skips typing', () => {
  const x = mount()
  x.tick(60000)
  assert(x.state().sleeping)
  const y = mount({ session: x.session, local: x.local, reduced: true })
  assert(y.pet.classes.has('is-sleeping'))
  y.doc.dispatchEvent(new Event('pointermove'))
  assert(!y.state().sleeping)
  assert.equal(y.state().line, 'awake')
  assert.equal(y.speech.textContent, '没睡！我没睡！')
  y.tick(4000)
  assert.equal(y.state().line, null)
})

test('long articles warn; read-to-bottom cameos wait for scrolling to settle', () => {
  const article = {
    textContent: '字'.repeat(3001),
    getBoundingClientRect: () => ({
      left: 80,
      top: 100,
      right: 1360,
      bottom: 700,
      width: 1280,
      height: 600
    })
  }
  const x = mount({ pathname: '/blog/long-post', article })
  assert.equal(x.state().line, 'long')
  x.win.dispatchEvent(new Event('scroll'))
  assert.notEqual(x.state().line, 'cameo')
  x.tick(15000)
  assert.equal(x.state().line, 'cameo')
  assert.equal(x.state().cameoType, 'end')
  assert.equal(x.state().pageCounts['/blog/long-post'], 1)
  x.tick(2000)
  assert.equal(x.state().line, null)
  assert(!x.pet.classes.has('is-cameo'))
})

const lifecycleBundle = await build({
  entryPoints: ['src/lib/page-lifecycle.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs'
})
test('page lifecycle mounts once per body and cleans listeners on swaps', () => {
  const document = new EventTarget()
  document.readyState = 'complete'
  document.body = {}
  const context = { document, AbortController, module: { exports: {} } }
  vm.runInNewContext(lifecycleBundle.outputFiles[0].text, context)
  let mounts = 0,
    cleanups = 0
  const signals = []
  context.module.exports.onPageLoad((signal) => {
    mounts++
    signals.push(signal)
    return () => cleanups++
  })
  document.dispatchEvent(new Event('astro:page-load'))
  assert.equal(mounts, 1)
  document.dispatchEvent(new Event('astro:before-swap'))
  assert(signals[0].aborted)
  assert.equal(cleanups, 1)
  document.body = {}
  document.dispatchEvent(new Event('astro:page-load'))
  assert.equal(mounts, 2)
  assert(!signals[1].aborted)
})

test('hero stays visible, rotates after five seconds, links the latest post and pauses on hover', () => {
  const x = mount({ hero: true, reduced: true })
  assert.equal(x.pet.dataset.heroMode, 'true')
  assert.equal(x.speech.textContent, 'boo! Welcome! I am Boo')
  x.bubble.dispatchEvent(new Event('pointerenter'))
  x.tick(20000)
  assert.equal(x.state().choice, 0)
  x.bubble.dispatchEvent(new Event('pointerleave'))
  x.tick(5000)
  assert.equal(x.state().choice, 1)
  assert.equal(x.speech.attrs.href, '/blog/real/post')
  x.tick(5000)
  assert.equal(x.state().choice, 2)
  assert(!('href' in x.speech.attrs))
  x.page('/contact')
  assert.equal(x.pet.dataset.heroMode, 'false')
  assert.equal(x.state().line, 'contact')
})

test('quiet is remembered, stops the hero and activities, and clicking Boo restores it', () => {
  const x = mount({ hero: true, reduced: true })
  x.quietButton.dispatchEvent(new Event('click'))
  assert.equal(x.local.get('pixel-ghost-quiet'), 'true')
  assert.equal(x.pet.dataset.heroMode, 'false')
  assert.equal(x.state().line, 'quiet')
  x.tick(15000)
  assert(!x.pet.classes.has('is-roaming'))
  assert(!x.pet.classes.has('is-cameo'))
  const y = mount({ local: x.local, hero: true, reduced: true })
  assert.equal(y.pet.dataset.heroMode, 'false')
  y.click()
  assert.equal(y.state().line, 'back')
  assert.equal(y.local.get('pixel-ghost-quiet'), 'false')
  assert.equal(y.pet.dataset.heroMode, 'true')
  y.tick(5000)
  assert.equal(y.state().line, 'hero')
})

test('wide-screen roaming stays outside main and scrolling freezes Boo in place', () => {
  const x = mount()
  x.tick(14000)
  assert(x.pet.classes.has('is-roaming'))
  assert(parseFloat(x.pet.style['--ghost-x']) >= x.main.box.right + 12)
  x.select('selected text')
  const position = x.pet.style['--ghost-x']
  x.tick(20000)
  assert.equal(x.pet.style['--ghost-x'], position)
  x.select('')
  x.win.dispatchEvent(new Event('scroll'))
  assert(!x.pet.classes.has('is-roaming'))
  assert(x.pet.classes.has('is-scroll-paused'))
  assert(x.pet.classes.has('hide-bubble'))
  const frozen = [x.pet.style['--ghost-x'], x.pet.style['--ghost-y']]
  for (let i = 0; i < 5; i++) {
    x.tick(700)
    x.win.dispatchEvent(new Event('scroll'))
    x.win.dispatchEvent(new Event('resize'))
    assert.deepEqual([x.pet.style['--ghost-x'], x.pet.style['--ghost-y']], frozen)
  }
  x.tick(1000)
  assert(x.pet.classes.has('is-scroll-paused'))
  x.tick(100)
  assert(!x.pet.classes.has('is-scroll-paused'))
  assert.deepEqual([x.pet.style['--ghost-x'], x.pet.style['--ghost-y']], frozen)
  const mobile = mount({ width: 390 })
  mobile.tick(40000)
  assert(!mobile.pet.classes.has('is-roaming'))
  for (const type of ['scroll', 'touchmove', 'resize']) {
    mobile.win.dispatchEvent(new Event(type))
    mobile.tick(500)
    assert(!mobile.pet.classes.has('is-positioned'))
    assert(!mobile.pet.classes.has('is-cameo'))
    assert(mobile.pet.classes.has('is-scroll-paused'))
  }
})

test('cameos stop at two per page and each phrase is used once per session', () => {
  const article = {
    textContent: 'A post',
    getBoundingClientRect: () => ({
      left: 80,
      top: 100,
      right: 1360,
      bottom: 700,
      width: 1280,
      height: 600
    })
  }
  const x = mount({ pathname: '/blog/post', article })
  x.tick(34000)
  assert.equal(x.state().pageCounts['/blog/post'], 2)
  assert.equal(new Set(x.state().usedCameos).size, 2)
  x.tick(15000)
  assert.equal(x.state().pageCounts['/blog/post'], 2)
  const y = mount({ session: x.session, pathname: '/blog/post', article })
  y.tick(25000)
  assert.equal(y.state().pageCounts['/blog/post'], 2)
})

test('title, code, image, tag and BackToTop cameos use the matching scene', () => {
  const rect = { left: 80, top: 300, right: 1360, bottom: 500, width: 1280, height: 200 }
  const node = { getBoundingClientRect: () => rect }
  const article = {
    textContent: 'A real article',
    getBoundingClientRect: () => ({ ...rect, bottom: 1800 })
  }
  const fixtures = [
    ['title', { pathname: '/blog/post', article }, 23000],
    ['code', { pathname: '/blog/post', article, pageLists: { '#content pre': [node] } }, 15000],
    ['image', { pathname: '/blog/post', article, pageLists: { '#content img': [node] } }, 15000],
    ['tags', { pathname: '/blog', pageNodes: { '#sidebar a[href*="/tags/"]': node } }, 15000],
    ['top', { pathname: '/contact', backToTop: true }, 15000]
  ]
  for (const [kind, options, delay] of fixtures) {
    const x = mount(options)
    if (kind === 'top') x.win.scrollY = 1000
    x.tick(delay)
    assert.equal(x.state().cameoType, kind)
    assert(x.pet.classes.has('is-cameo'), kind)
    assert.equal(x.state().pageCounts[options.pathname], 1)
    x.tick(1800)
    assert(!x.pet.classes.has('is-cameo'), kind)
  }
})

test('mouse proximity makes Boo shy; blocked controls and boot layer stop activity', () => {
  const x = mount()
  const before = parseFloat(x.pet.style['--ghost-y'])
  const event = new Event('pointermove')
  Object.defineProperties(event, { clientX: { value: 1490 }, clientY: { value: before + 30 } })
  x.doc.dispatchEvent(event)
  assert(parseFloat(x.pet.style['--ghost-y']) < before)
  const y = mount()
  y.doc.documentElement.classList.add('boot-running')
  const position = y.pet.style['--ghost-x']
  y.tick(20000)
  assert.equal(y.pet.style['--ghost-x'], position)
  assert(!y.pet.classes.has('is-cameo'))
  const obstacle = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 1600,
      bottom: 800,
      width: 1600,
      height: 800
    })
  }
  const z = mount({
    pageLists: {
      'a[href],button,input,select,textarea,[contenteditable="true"],[data-copy-code]': [obstacle]
    }
  })
  assert(z.pet.classes.has('is-obstructed'))
})

test('hero waits for boot to finish before starting its first full sentence', () => {
  const x = mount({ hero: true, reduced: true, boot: true })
  x.tick(3000)
  assert.equal(x.speech.textContent, '')
  x.doc.documentElement.classList.remove('boot-running')
  x.tick(100)
  assert.equal(x.state().line, 'hero')
  assert.equal(x.state().choice, 0)
  assert.equal(x.speech.textContent, 'boo! Welcome! I am Boo')
  x.tick(4999)
  assert.equal(x.state().choice, 0)
})

test('prose blocks cameo destinations and the swept movement path', () => {
  const prose = {
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({
      left: 80,
      top: 0,
      right: 1595,
      bottom: 2000,
      width: 1515,
      height: 2000
    })
  }
  const x = mount({
    pathname: '/blog/post',
    article: { textContent: 'Article', getBoundingClientRect: prose.getBoundingClientRect },
    pageLists: { '#content,.prose': [prose] }
  })
  x.tick(40000)
  assert(x.pet.classes.has('is-obstructed'))
  assert(!x.pet.classes.has('is-cameo'))
  assert(!x.pet.classes.has('is-positioned'))
  assert.notEqual(x.state().line, 'cameo')
  // Both endpoints fit, but the route between them crosses a narrow prose obstacle.
  const crossing = {
    ...prose,
    getBoundingClientRect: () => ({
      left: 1479,
      top: 0,
      right: 1480,
      bottom: 2000,
      width: 1,
      height: 2000
    })
  }
  const y = mount({
    pathname: '/blog/post',
    article: {
      textContent: 'Article',
      getBoundingClientRect: () => ({
        left: 80,
        top: 100,
        right: 1360,
        bottom: 1800,
        width: 1280,
        height: 1700
      })
    },
    pageLists: { '#content,.prose': [crossing] }
  })
  y.tick(30000)
  assert(!y.pet.classes.has('is-obstructed'))
  assert(!y.pet.classes.has('is-cameo'))
  assert.equal(y.state().pageCounts['/blog/post'], undefined)
})
