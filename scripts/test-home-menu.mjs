import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/lib/home-menu.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'cjs'
})
function mount(home = true) {
  class Element extends EventTarget {
    dataset = {}
    kind = ''
    clicks = 0
    closest(selector) {
      if (this.kind === 'a') return selector === 'a' ? this : null
      if (this.kind === 'input') return selector.includes('input') ? this : null
      return null
    }
    focus() {
      this.focused = true
      this.dispatchEvent(new Event('focus'))
    }
    click() {
      this.clicks++
    }
  }
  const links = Array.from({ length: 5 }, () => {
    const link = new Element()
    link.kind = 'a'
    return link
  })
  const menu = new Element()
  menu.querySelectorAll = () => links
  menu.contains = (target) => links.includes(target)
  const document = new EventTarget()
  document.body = new Element()
  document.readyState = 'complete'
  document.querySelector = (selector) => (selector === '[data-title-menu]' && home ? menu : null)
  const context = { document, Element, AbortController, module: { exports: {} } }
  vm.runInNewContext(bundle.outputFiles[0].text, context)
  context.module.exports.initHomeMenu()
  function key(value, target = document.body) {
    const event = new Event('keydown', { cancelable: true })
    Object.defineProperties(event, { key: { value }, target: { value: target } })
    document.dispatchEvent(event)
    return event
  }
  return { document, links, key, Element }
}

test('arrows wrap, focus the current link, and Enter opens the selected destination', () => {
  const x = mount()
  assert.equal(x.links[0].dataset.selected, 'true')
  assert(x.key('ArrowUp').defaultPrevented)
  assert.equal(x.links[4].dataset.selected, 'true')
  assert(x.links[4].focused)
  x.key('Enter')
  assert.equal(x.links[4].clicks, 1)
  x.key('ArrowDown')
  assert.equal(x.links[0].dataset.selected, 'true')
})

test('pointer hover and keyboard focus select menu items', () => {
  const x = mount()
  x.links[2].dispatchEvent(new Event('pointerenter'))
  assert.equal(x.links[2].dataset.selected, 'true')
  x.links[3].focus()
  assert.equal(x.links[3].dataset.selected, 'true')
})

test('inputs, off-menu links, non-home pages and page teardown retain normal keys', () => {
  const x = mount()
  const input = new x.Element()
  input.kind = 'input'
  assert(!x.key('ArrowDown', input).defaultPrevented)
  const externalLink = new x.Element()
  externalLink.kind = 'a'
  assert(!x.key('Enter', externalLink).defaultPrevented)
  x.document.dispatchEvent(new Event('astro:before-swap'))
  assert(!x.key('ArrowDown').defaultPrevented)
  const y = mount(false)
  assert(!y.key('ArrowDown').defaultPrevented)
})
