import { test, expect } from "./fixtures";
import { testEnvironment } from "../server/test-environment";
import { resolve } from "node:path";

test("browser and MCP connections use the owned test server and private test token", async ({
  page,
  baseURL,
}) => {
  const settings = testEnvironment(process.cwd())!;
  expect(baseURL).toBe(settings.origin);
  const identity = await (
    await page.request.get("/__localpad_e2e__/identity")
  ).json();
  expect(identity).toMatchObject(settings);
  const configuration = await (
    await page.request.get("/api/localpad/connection")
  ).json();
  expect(configuration.config.mcpServers.localpad.env).toEqual({
    LOCALPAD_URL: settings.origin,
    LOCALPAD_E2E_RUN_ID: settings.runId,
    LOCALPAD_E2E_MODE: settings.mode,
  });
  expect(identity.databaseFile).not.toBe(resolve(".localpad/projects.sqlite"));
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
});
