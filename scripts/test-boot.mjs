import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const source = readFileSync('src/components/BootScreen.astro', 'utf8')
const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)[1]
function mount({
  seen = false,
  reduced = false,
  ua = 'Reader',
  readyState = 'loading',
  width = 640
} = {}) {
  let now = 0,
    serial = 0
  const timers = new Map()
  class Node extends EventTarget {
    children = []
    dataset = {}
    hidden = true
    connected = true
    style = {
      setProperty(name, value) {
        this[name] = value
      }
    }
    attrs = {}
    ownText = ''
    get textContent() {
      return this.ownText + this.children.map((node) => node.textContent ?? '').join('')
    }
    set textContent(value) {
      this.ownText = value
      this.children = []
    }
    set innerHTML(value) {
      this.ownText = value.replace(/<[^>]+>/g, '')
    }
    append(node) {
      this.children.push(node)
    }
    remove() {
      this.connected = false
    }
    setAttribute(name, value) {
      this.attrs[name] = value
    }
    getBoundingClientRect() {
      return {}
    }
    get scrollHeight() {
      return this.children.length * 20
    }
  }
  const root = new Node(),
    box = new Node(),
    log = new Node(),
    bar = new Node(),
    track = new Node(),
    boo = new Node(),
    pct = new Node(),
    hello = new Node(),
    tiles = new Node()
  const classes = new Set()
  root.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name) }
  const nodes = {
    '#boot-terminal': log,
    '#boot-progress': bar,
    '#boot-beans': track,
    '#boot-boo': boo,
    '#boot-percent': pct,
    '#boot-welcome': hello,
    '#boot-tiles': tiles
  }
  box.querySelector = (selector) => nodes[selector]
  const document = new EventTarget()
  document.documentElement = root
  document.readyState = readyState
  document.getElementById = () => box
  document.createElement = () => new Node()
  document.createTextNode = (text) => ({ textContent: text })
  const window = new EventTarget()
  const media = new EventTarget()
  media.matches = reduced
  const storage = new Map(seen ? [['boo-boot-played', '1']] : [])
  const timeout = (fn, delay) => {
    const id = ++serial
    timers.set(id, { fn, at: now + delay })
    return id
  }
  const context = {
    document,
    window,
    navigator: { userAgent: ua },
    matchMedia: () => media,
    sessionStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value)
    },
    innerWidth: width,
    innerHeight: 400,
    AbortController,
    setTimeout: timeout,
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => timeout(fn, 16),
    addEventListener: window.addEventListener.bind(window)
  }
  vm.runInNewContext(script, context)
  function tick(ms) {
    const end = now + ms
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at
      timers.delete(next[0])
      next[1].fn()
    }
    now = end
  }
  return {
    box,
    log,
    bar,
    track,
    boo,
    pct,
    hello,
    tiles,
    classes,
    storage,
    document,
    window,
    media,
    tick,
    timers
  }
}

test('complete sequence renders all logs, commands, 50 beans, 100% and welcome in about 3s', () => {
  const x = mount()
  assert(x.classes.has('boot-running'))
  assert.equal(x.log.children.length, 2)
  assert.equal(x.track.children.length, 50)
  x.tick(2600)
  assert.equal(x.log.children.filter((p) => p.textContent.includes('OK')).length, 13)
  assert.equal(x.log.children.filter((p) => p.className === 'boot-kernel').length, 8)
  assert(x.log.textContent.includes('naiwa login: guest'))
  assert(x.log.textContent.includes('guest@naiwa:~$ ./start --with-boo'))
  assert.equal(x.pct.textContent, '100%')
  assert.equal(x.boo.attrs['data-happy'], '')
  assert(x.track.children.every((dot) => dot.style.visibility === 'hidden'))
  x.tick(500)
  assert.equal(x.hello.textContent, 'boo! welcome.')
  assert(!x.box.connected)
  assert(!x.classes.has('boot-running'))
  assert.equal(x.timers.size, 0)
})

test('return visits, client navigation, reduced motion and crawler UAs do not play', () => {
  for (const options of [
    { seen: true },
    { readyState: 'complete' },
    { reduced: true },
    { ua: 'Googlebot' },
    { ua: 'ExampleCrawler' }
  ]) {
    const x = mount(options)
    assert(!x.box.connected, JSON.stringify(options))
    assert(!x.classes.has('boot-running'))
    assert.equal(x.log.children.length, 0)
  }
})

test('any click, key or scrolling skips through the pixel transition and releases Boo', () => {
  for (const name of ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    const x = mount()
    x.window.dispatchEvent(new Event(name, { cancelable: true }))
    assert(x.tiles.children.length > 0)
    x.tick(240)
    assert(!x.box.connected, name)
    assert(!x.classes.has('boot-running'), name)
    assert.equal(x.timers.size, 0, name)
  }
})

test('mobile bean count adapts, preference changes and navigation clean up immediately', () => {
  const x = mount({ width: 390 })
  assert(x.track.children.length < 50)
  x.document.dispatchEvent(new Event('astro:before-swap'))
  assert(!x.box.connected)
  assert(!x.classes.has('boot-running'))
  const y = mount()
  y.media.dispatchEvent(new Event('change'))
  assert(!y.box.connected)
  assert.equal(y.timers.size, 0)
})

test('inline source is under 8 KiB and defaults to hidden with no external assets', () => {
  assert(Buffer.byteLength(source) < 8192)
  assert.match(source, /id="boot-screen" hidden aria-hidden="true"/)
  assert(!/\bsrc=|@import|url\(/.test(source))
  assert.match(source, /boot-running \[data-ghost-pet\]\{visibility:hidden!important\}/)
})

test('the terminal auto-scroll does not skip its own boot sequence', () => {
  const x = mount()
  const event = new Event('scroll')
  Object.defineProperty(event, 'target', { value: x.log })
  x.window.dispatchEvent(event)
  assert.equal(x.tiles.children.length, 0)
  assert(x.box.connected)
  x.tick(3100)
  assert(!x.box.connected)
})
