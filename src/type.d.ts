declare module 'virtual:config' {
  const Config: import('astro-pure/types').ConfigOutput
  export default Config
}

declare namespace App {
  interface Locals {
    runtime: import('./lib/api/runtime').RuntimeContext
  }
}
