import {
  test,
  expect,
  expectPythonStatus,
  PYTHON_OPERATION_TIMEOUT_MS,
  isolateProjects,
} from "./fixtures";

test("production cold-loads Monaco and executes Python without internet access", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(2 * PYTHON_OPERATION_TIMEOUT_MS + 30_000);
  const target = baseURL!;
  const origin = new URL(target!).origin;
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1440, height: 960 },
  });
  const externalRequests: string[] = [];
  const localRequests: string[] = [];
  const pageErrors: string[] = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin) {
      localRequests.push(url);
      await route.continue();
    } else {
      externalRequests.push(url);
      await route.abort("internetdisconnected");
    }
  });
  try {
    const page = await context.newPage();
    await isolateProjects(page);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(target!);
    await expect(page.locator(".monaco-editor")).toBeVisible();
    // Chromium's EditContext input is intentionally zero-sized; Monaco paints
    // the actual editor text in its visible view-lines layer.
    await expect(
      page.getByRole("textbox", { name: "Python code editor" }),
    ).toBeAttached();
    await expect(page.locator(".monaco-editor .view-lines")).toContainText(
      "def pair_sum",
    );
    await page
      .getByRole("button", { name: "New question", exact: true })
      .click();
    await page.getByLabel("Question title").fill("Offline runtime check");
    await page
      .getByLabel("Question prompt")
      .fill("Exercise the locally bundled Python standard library.");
    await page
      .getByLabel("Starter code")
      .fill(
        'from math import factorial\nprint(f"offline-ready: {factorial(5)}")\n',
      );
    await page
      .getByRole("button", { name: "Save question", exact: true })
      .click();
    await page.locator(".run-button").click();
    await expectPythonStatus(page, "Completed");
    await expect(page.locator(".console-output")).toHaveText(
      "offline-ready: 120\n",
    );
    await page.getByRole("tab", { name: "Scratchpad", exact: true }).click();
    await page.getByRole("tab", { name: "Notes", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Scratchpad notes" })
      .fill("Check factorial at zero before coding.");
    await page.getByRole("tab", { name: "Flowchart", exact: true }).click();
    await page.getByRole("button", { name: "Add start", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Start: Start", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page
      .getByRole("button", { name: "Start 15-minute practice", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible({
      timeout: PYTHON_OPERATION_TIMEOUT_MS,
    });
    await expect(page.locator(".learning-mode")).toContainText(
      "Local variation",
    );
    await expect(
      page.getByRole("button", { name: "Pause timer", exact: true }),
    ).toBeEnabled();
    expect(
      localRequests.some((url) => url.endsWith("/python/pyodide.mjs")),
    ).toBe(true);
    expect(
      localRequests.some((url) => url.endsWith("/python/pyodide.asm.wasm")),
    ).toBe(true);
    expect(
      localRequests.some((url) => url.endsWith("/python/python_stdlib.zip")),
    ).toBe(true);
    expect(
      externalRequests,
      "The production app must never request a CDN or internet resource",
    ).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
