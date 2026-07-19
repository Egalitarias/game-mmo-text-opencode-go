import { defineConfig } from "@playwright/test";

/**
 * E2E smoke tests run a real server + real client build.
 * Prereq: pnpm exec playwright install chromium
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: [
    {
      command: "pnpm -C ../server start",
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm -C ../client build && pnpm -C ../client exec vite preview --port 4173",
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
