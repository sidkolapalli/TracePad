import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { testEnvironment } from "./server/test-environment";

if (process.env.LOCALPAD_PRODUCTION_URL)
  throw new Error(
    "External test servers are disabled. Use npm run test:e2e:production for an isolated production preview.",
  );
process.env.LOCALPAD_E2E_RUN_ID ??= randomUUID();
const settings = testEnvironment(fileURLToPath(new URL(".", import.meta.url)))!;

export default defineConfig({
  testDir: "./tests",
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never" }]],
  testIgnore:
    settings.mode === "production"
      ? ["**/runtime.spec.ts", "**/modules-runtime.spec.ts"]
      : ["**/production.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    baseURL: settings.origin,
    browserName: "chromium",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/test-server.mjs",
    env: {
      LOCALPAD_E2E_RUN_ID: settings.runId,
      LOCALPAD_E2E_MODE: settings.mode,
      LOCALPAD_DATA_DIR: settings.directory,
    },
    url: `${settings.origin}/__localpad_e2e__/identity`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
