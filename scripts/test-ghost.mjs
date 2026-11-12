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
  missing = false
} = {}) {
  let now = new Date('2026-11-13T12:00:00').getTime()
  let id = 0
  const timers = new Map()
  class Element extends EventTarget {
    dataset = {}
    attrs = {}
    textContent = ''
    offsetWidth = 48
    classes = new Set()
    classList = {
      add: (...names) => names.forEach((n) => this.classes.add(n)),
      remove: (...names) => names.forEach((n) => this.classes.delete(n)),
      toggle: (name, force) => {
        if (force ?? !this.classes.has(name)) this.classes.add(name)
        else this.classes.delete(name)
      }
    }
    setAttribute(k, v) {
      this.attrs[k] = v
    }
    contains(el) {
      return el === this || el === button
    }
    getBoundingClientRect() {
      return { bottom: this.bottom ?? 2000 }
    }
  }
  const pet = new Element(),
    button = new Element(),
    speech = new Element(),
    live = new Element()
  pet.querySelector = (selector) =>
    selector === 'button' ? button : selector === '[data-ghost-speech]' ? speech : live
  const doc = new EventTarget()
  doc.body = { dataset: { pageKind: missing ? '404' : undefined } }
  doc.querySelector = (selector) => (selector === '[data-ghost-pet]' ? pet : article)
  const win = new EventTarget()
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
    Element
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

test('long article warns on entry and read-to-bottom line fires once', () => {
  const article = { textContent: '字'.repeat(3001), getBoundingClientRect: () => ({ bottom: 700 }) }
  const x = mount({ pathname: '/blog/long-post', article })
  assert.equal(x.state().line, 'long')
  x.win.dispatchEvent(new Event('scroll'))
  assert.equal(x.state().line, 'finished')
  x.tick(10000)
  x.win.dispatchEvent(new Event('scroll'))
  assert.equal(x.state().line, null)
  assert.deepEqual(x.state().read, ['/blog/long-post'])
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
