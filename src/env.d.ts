/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime: import('./lib/api/runtime').RuntimeContext
  }
}
