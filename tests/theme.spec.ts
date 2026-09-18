import { readProjectState } from "./fixtures";
import { test, expect } from "./fixtures";
import { defaultSession, STORAGE_KEY } from "../src/session";

test("light theme persists, keeps the editor model intact, and covers desktop and narrow dialogs", async ({
  page,
}) => {
  test.setTimeout(90000);
  const initial = defaultSession();
  initial.activeId = "sandbox";
  initial.drafts.sandbox = {
    source: 'print("theme preserved")',
    stdin: "",
    tests: [],
  };
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: initial },
  );
  // The same assertions run against Vite dev or the actual built preview.
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 30, y: 12 } });
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End",
  );
  await page.keyboard.insertText("#");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  for (const [selector, color] of [
    [".app-header", "rgb(238, 241, 245)"],
    [".question-pane", "rgb(248, 250, 252)"],
    [".editor-toolbar", "rgb(248, 250, 252)"],
    [".output-pane", "rgb(255, 255, 255)"],
    [".app-footer", "rgb(238, 241, 245)"],
  ])
    await expect(page.locator(selector)).toHaveCSS("background-color", color);
  await expect(page.locator(".monaco-editor")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".view-lines")).toContainText(
    'print("theme preserved")#',
  );
  // Theme changes must not recreate the editor or discard its undo stack.
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 30, y: 12 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".view-lines")).toHaveText(
    'print("theme preserved")',
  );
  await page.locator(".run-button").click();
  await expect(page.locator(".console-output")).toHaveText(
    "theme preserved\n",
    { timeout: 30000 },
  );
  await expect
    .poll(async () => readProjectState(page).then((s) => s.session.theme))
    .toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".view-lines")).toContainText("theme preserved");
  await expect(page.locator(".monaco-editor")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({ path: "artifacts/light-workspace-desktop.png" });
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.screenshot({ path: "artifacts/light-practice-desktop.png" });
  await page.getByRole("tab", { name: "AI coach", exact: true }).click();
  await expect(page.getByLabel("MCP server configuration")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/light-workspace-mobile.png" });
  await page.getByRole("tab", { name: "Brief", exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const button = page.getByRole("button", { name: "Switch to dark mode" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const newQuestionBox = await page
      .getByRole("button", { name: "New question" })
      .boundingBox();
    expect(newQuestionBox!.x + newQuestionBox!.width).toBeLessThanOrEqual(
      width,
    );
    await page.getByRole("button", { name: "New question" }).click();
    await expect(page.getByLabel("Question title")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.getByLabel("Question title")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator(".app-header")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 27)",
  );
  await expect(page.locator(".question-pane")).toHaveCSS(
    "background-color",
    "rgb(28, 33, 42)",
  );
  await expect(page.locator(".monaco-editor")).toHaveCSS(
    "background-color",
    "rgb(23, 27, 34)",
  );
});
