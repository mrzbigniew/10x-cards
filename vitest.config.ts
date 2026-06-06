/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
    },
    alias: {
      "@": "/src",
    },
  },
});
