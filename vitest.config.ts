/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";
import node from "@astrojs/node";

export default getViteConfig(
  {
    // Pin root to process.cwd() so the drive-letter casing matches Node's ESM
    // loader (Windows reports "D:\" while Vite would otherwise use "d:\"),
    // preventing a double-load of the vitest runtime that breaks the runner.
    root: process.cwd(),
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
      passWithNoTests: true,
      exclude: ["tests/**", "node_modules/**", "e2e/**"],
    },
  },
  {
    adapter: node({ mode: "standalone" }),
  },
);
