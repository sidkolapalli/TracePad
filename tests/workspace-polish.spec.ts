import { test, expect, readProjectState, type Page } from "./fixtures";
import { defaultSession, STORAGE_KEY } from "../src/session";

async function expectInsideViewport(page: Page, name: string) {
  const action = page.getByRole("button", { name, exact: true });
  await expect(action).toBeVisible();
  const bounds = await action.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
}

test("practice keeps its start action and assistant prerequisite visible on a laptop and small phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expectInsideViewport(page, "Start 15-minute practice");
  await expect(page.locator(".practice-setup-footer")).toContainText(
    "Your timer begins after the question is ready.",
  );
  await expect(page.locator(".practice-setup-footer")).toContainText(
    "No assistant activity yet.",
  );
  await expect(
    page.getByRole("button", { name: "Request an AI question", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "artifacts/polish-practice-desktop-dark.png",
    animations: "disabled",
  });
  await page.getByRole("radio", { name: /60-minute mock interview/ }).check();
  await expectInsideViewport(page, "Start 60-minute mock");
  await page
    .getByRole("button", { name: "Connection settings", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "AI coach", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Practice", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expectInsideViewport(page, "Start 15-minute practice");
  await expectInsideViewport(page, "Connection settings");
  const topic = await page
    .locator(".practice-topic-field select")
    .boundingBox();
  const footer = await page.locator(".practice-setup-footer").boundingBox();
  expect(topic!.y + topic!.height).toBeLessThanOrEqual(footer!.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/polish-practice-mobile-light.png",
    animations: "disabled",
  });
  await page.getByRole("radio", { name: /60-minute mock interview/ }).check();
  await expectInsideViewport(page, "Start 60-minute mock");
  await page.setViewportSize({ width: 320, height: 480 });
  await expectInsideViewport(page, "Start 60-minute mock");
  await expectInsideViewport(page, "Connection settings");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  for (const name of [
    "Run",
    "Run tests",
    "Collapse output",
    "Switch to dark mode",
  ]) {
    await expectInsideViewport(page, name);
    const bounds = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: "artifacts/polish-workspace-mobile-light.png",
    animations: "disabled",
  });
});

test("deleted assertions can be restored in order, while an empty suite has a direct add-tests route", async ({
  page,
}) => {
  const session = defaultSession();
  session.activeId = "sandbox";
  session.drafts.sandbox = {
    source: "n = 2",
    stdin: "",
    tests: [
      { id: "first", name: "Initial value", code: "assert n == 2" },
      { id: "second", name: "Doubled value", code: "assert n * 2 == 4" },
    ],
  };
  await page.addInitScript(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: STORAGE_KEY, state: session },
  );
  await page.goto("/");
  await page.locator("#tab-tests").click();
  for (const name of ["Initial value", "Doubled value"]) {
    await page.locator(".test-case-heading").filter({ hasText: name }).click();
    await page
      .getByRole("button", { name: `Delete test ${name}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeFocused();
  }
  await page.getByRole("tab", { name: "Console", exact: true }).click();
  await page.getByRole("button", { name: "Add tests", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add test", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Test name", { exact: true })).toHaveValue(
    "Doubled value",
  );
  await expect(page.getByLabel("Test name", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Test name", { exact: true })).toHaveValue(
    "Initial value",
  );
  await expect(page.locator(".test-delete-notice")).not.toBeVisible();
  await expect
    .poll(
      async () => (await readProjectState(page)).session.drafts.sandbox.tests,
    )
    .toEqual(session.drafts.sandbox.tests);
  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  await expect(page.locator(".test-summary")).toContainText(
    "2 passed · 0 failed",
  );
  // The restored case can remain expanded after executing the suite.
  if (
    !(await page
      .getByRole("button", { name: "Delete test Initial value", exact: true })
      .isVisible())
  )
    await page
      .locator(".test-case-heading")
      .filter({ hasText: "Initial value" })
      .click();
  await page
    .getByRole("button", { name: "Delete test Initial value", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Practice library", exact: true })
    .click();
  await page.getByRole("button", { name: /Pair sum/ }).click();
  await page.locator("#tab-tests").click();
  await expect(page.locator(".test-delete-notice")).not.toBeVisible();
});
