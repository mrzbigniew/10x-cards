import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// `astro:env/server` is a server-only virtual module; under the jsdom test
// environment Astro's plugin refuses to load it (ServerOnlyModule). Replace it
// globally with a plain module so any code-under-test that imports server env
// vars can load. Suites that need to toggle individual values (e.g. the missing
// OPENROUTER_API_KEY case) re-mock + re-import the module under test themselves.
vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-openrouter-key",
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "test-supabase-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
}));

afterEach(() => {
  cleanup();
});
