import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: fileURLToPath(new URL("./tests/e2e/global-setup.ts", import.meta.url)),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  webServer: {
    command: "pnpm preview:e2e",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe"
  }
});
