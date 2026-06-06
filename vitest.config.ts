/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config'
import node from '@astrojs/node';


export default getViteConfig({
  test: {
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
    },
    alias: {
      "@": "/src",
    }
  }
}, {
  adapter: node({ mode: 'standalone' })
})
