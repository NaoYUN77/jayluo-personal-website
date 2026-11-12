// Rebind page-local behavior after ClientRouter swaps; dispose global listeners first.
export function onPageLoad(setup: (signal: AbortSignal) => void | (() => void)) {
  let controller: AbortController | undefined
  let cleanup: void | (() => void)
  const dispose = () => {
    controller?.abort()
    cleanup?.()
    cleanup = undefined
  }
  let mountedBody: HTMLElement | undefined
  const mount = () => {
    if (mountedBody === document.body && controller && !controller.signal.aborted) return
    dispose()
    mountedBody = document.body
    controller = new AbortController()
    cleanup = setup(controller.signal)
  }
  document.addEventListener('astro:before-swap', dispose)
  document.addEventListener('astro:page-load', mount)
  if (document.readyState !== 'loading') mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
}
