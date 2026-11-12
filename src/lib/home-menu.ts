import { onPageLoad } from '@/lib/page-lifecycle'

export function initHomeMenu() {
  onPageLoad((signal) => {
    const menu = document.querySelector<HTMLElement>('[data-title-menu]')
    if (!menu) return
    const links = [...menu.querySelectorAll<HTMLAnchorElement>('a')]
    let selected = 0
    const select = (index: number, focus = false) => {
      selected = (index + links.length) % links.length
      links.forEach((link, i) => {
        link.dataset.selected = String(i === selected)
      })
      if (focus) links[selected].focus({ preventScroll: true })
    }
    links.forEach((link, index) => {
      link.addEventListener('pointerenter', () => select(index), { signal })
      link.addEventListener('focus', () => select(index), { signal })
    })
    select(0)
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return
        const target = event.target instanceof Element ? event.target : null
        if (
          document.querySelector('dialog[open]') ||
          target?.closest(
            'input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
          )
        )
          return
        if (target?.closest('a') && !menu.contains(target)) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          select(selected + (event.key === 'ArrowDown' ? 1 : -1), true)
        } else if (event.key === 'Enter' && !target?.closest('a')) {
          event.preventDefault()
          links[selected].click()
        }
      },
      { signal }
    )
  })
}
