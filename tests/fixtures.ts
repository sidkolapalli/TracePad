import { test as base, expect, type Page } from "@playwright/test";
import type { SessionState } from "../src/types";
import type { LearningState } from "../src/learning/types";
import type { ProjectDocument } from "../src/projects/types";
import { testEnvironment } from "../server/test-environment";
import { EXECUTION_TIMEOUT_MS, INITIALIZATION_TIMEOUT_MS } from "../src/runner";

// A run may use both watchdog budgets before it reports a final result. Keep
// UI assertions aligned with that contract, plus time to render the result.
export const PYTHON_OPERATION_TIMEOUT_MS =
  INITIALIZATION_TIMEOUT_MS + EXECUTION_TIMEOUT_MS + 5_000;

export async function expectPythonStatus(
  page: Page,
  status: "Completed" | "Failed" | "Stopped" | "Timed out",
) {
  await expect(page.locator(".output-status")).toContainText(status, {
    timeout: PYTHON_OPERATION_TIMEOUT_MS,
  });
}

/** Each browser test gets a real SQLite project, including legacy migration inputs. */
export async function isolateProjects(page: Page) {
  const settings = testEnvironment(process.cwd());
  if (!settings)
    throw new Error("Browser tests require an isolated Playwright server.");
  const identity = await page.request.get(
    `${settings.origin}/__localpad_e2e__/identity`,
  );
  expect(identity.ok(), "The isolated test server must be running").toBe(true);
  expect(
    await identity.json(),
    "Refuse to create projects in any other server or database",
  ).toMatchObject({
    runId: settings.runId,
    mode: settings.mode,
    databaseFile: settings.databaseFile,
    tokenFile: settings.tokenFile,
  });
  const ids = new Set<string>();
  let bootstrap: Promise<ProjectDocument> | undefined;
  await page.route("**/api/projects", async (route) => {
    expect(new URL(route.request().url()).origin).toBe(settings.origin);
    const response = await route.fetch();
    const data = await response.json();
    if (route.request().method() === "POST") {
      if (data.project) ids.add(data.project.id);
      await route.fulfill({ response });
    } else
      await route.fulfill({
        response,
        json: {
          projects: data.projects.filter((p: { id: string }) => ids.has(p.id)),
        },
      });
  });
  await page.route("**/api/projects/bootstrap", async (route) => {
    expect(new URL(route.request().url()).origin).toBe(settings.origin);
    const input = route.request().postDataJSON() ?? {};
    bootstrap ??= (async () => {
      const response = await page.request.post(
        new URL("/api/projects", route.request().url()).href,
        {
          headers: { "X-Localpad": "1" },
          data: { details: { name: "Interview practice" }, state: input.state },
        },
      );
      const data = await response.json();
      if (data.project) ids.add(data.project.id);
      return data;
    })();
    const data = await bootstrap;
    await route.fulfill({
      json: await (
        await page.request.get(
          new URL(`/api/projects/${data.project.id}`, route.request().url())
            .href,
        )
      ).json(),
    });
  });
}
export const test = base.extend({
  page: async ({ page }, use) => {
    await isolateProjects(page);
    await use(page);
    await page.unrouteAll({ behavior: "wait" });
  },
});
export { expect };
export type { Page };
export async function readProjectState(
  page: Page,
): Promise<{ session: SessionState; learning: LearningState }> {
  return page.evaluate(() => {
    const id = localStorage.getItem("localpad.active-project.v1");
    const raw = localStorage.getItem(
      `localpad.project.v1.${id}.${sessionStorage.getItem("localpad.recovery-client.v1")}`,
    );
    if (raw) return JSON.parse(raw).state;
    return fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => d.state);
  });
}
