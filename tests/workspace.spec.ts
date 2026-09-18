import {
  test,
  expect,
  expectPythonStatus,
  PYTHON_OPERATION_TIMEOUT_MS,
  readProjectState,
  type Page,
} from "./fixtures";
import { defaultSession, STORAGE_KEY } from "../src/session";
import { sandboxExercise } from "../src/exercises";
import type { SessionState } from "../src/types";

async function readSaved(page: Page): Promise<SessionState | null> {
  return (await readProjectState(page)).session;
}

async function editSource(page: Page, source: string) {
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 30, y: 12 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (index) {
      await page.keyboard.press("Enter");
      // Replace Monaco's automatic indentation, just as when entering a new line by hand.
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+ArrowLeft" : "Home",
      );
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+Shift+ArrowRight" : "Shift+End",
      );
      await page.keyboard.press("Delete");
    }
    if (lines[index]) await page.keyboard.insertText(lines[index]);
  }
}

async function chooseQuestion(page: Page, title: string) {
  await page.getByRole("button", { name: "Practice library" }).click();
  await page.getByRole("textbox", { name: "Search exercises" }).fill(title);
  await page
    .locator(".library-list")
    .getByRole("button")
    .filter({ hasText: title })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Practice library" }),
  ).toBeFocused();
}

test("custom question lifecycle, assertion results, independent drafts, and refresh recovery", async ({
  page,
}) => {
  test.setTimeout(2 * PYTHON_OPERATION_TIMEOUT_MS + 60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "New question" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Question title").fill("Double value");
  const prompt =
    "Return twice the value. <script>window.promptExecuted = true</script>";
  await dialog.getByLabel("Question prompt").fill(prompt);
  await dialog
    .getByLabel("Starter code")
    .fill("def solve(value):\n    return value * 2\n");
  await dialog.getByRole("button", { name: "Add test" }).click();
  await dialog
    .getByRole("textbox", { name: "Test 1 name", exact: true })
    .fill("Positive value");
  await dialog
    .getByRole("textbox", { name: "Test 1 assertion", exact: true })
    .fill("assert solve(4) == 8");
  await dialog.getByRole("button", { name: "Add test" }).click();
  await dialog
    .getByRole("textbox", { name: "Test 2 name", exact: true })
    .fill("Zero value");
  await dialog
    .getByRole("textbox", { name: "Test 2 assertion", exact: true })
    .fill("assert solve(0) == 0");
  await dialog.getByRole("button", { name: "Save question" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Double value", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".question-description")).toHaveText(prompt);
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).promptExecuted,
    ),
  ).toBeUndefined();

  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  await expectPythonStatus(page, "Completed");
  await expect(page.locator(".test-summary")).toContainText(
    "2 passed · 0 failed",
  );
  await page
    .locator(".test-case-heading")
    .filter({ hasText: "Positive value" })
    .click();
  await page
    .getByRole("textbox", { name: "Assertion for Positive value", exact: true })
    .fill("assert solve(4) == 9");
  await expect(
    page.locator(".test-case-heading").filter({ hasText: "Positive value" }),
  ).toContainText("Ready");
  await expect(page.locator(".test-summary")).not.toContainText("passed");
  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  await expectPythonStatus(page, "Failed");
  await expect(page.locator(".test-summary")).toContainText(
    "1 passed · 1 failed",
  );
  await expect(page.locator(".test-error")).toContainText("AssertionError");

  const customSource =
    'def solve(value):\n    return value * 2\n\nprint("draft survives")\n';
  await editSource(page, customSource);
  await expect
    .poll(async () => {
      const state = await readSaved(page);
      return state?.drafts[state.activeId]?.source;
    })
    .toBe(customSource);
  const customId = (await readSaved(page))!.activeId;
  await expect(page.locator(".test-summary")).not.toContainText("passed");
  await chooseQuestion(page, "Balanced brackets");
  await editSource(page, 'print("independent second draft")\n');
  await expect
    .poll(
      async () => (await readSaved(page))?.drafts["balanced-brackets"]?.source,
    )
    .toBe('print("independent second draft")\n');
  await chooseQuestion(page, "Double value");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "draft survives",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Double value", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "draft survives",
  );
  expect((await readSaved(page))?.drafts[customId].tests[0].code).toBe(
    "assert solve(4) == 9",
  );

  await page
    .getByRole("button", { name: "Edit question", exact: true })
    .click();
  await dialog.getByLabel("Question title").fill("Double value revised");
  await dialog
    .getByLabel("Question prompt")
    .fill("A revised problem statement.");
  await dialog
    .getByLabel("Starter code")
    .fill("def solve(value):\n    return value * 3\n");
  await dialog
    .getByRole("button", { name: "Remove Zero value", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save question" }).click();
  await expect(
    page.getByRole("heading", { name: "Double value revised", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".question-description")).toHaveText(
    "A revised problem statement.",
  );
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "draft survives",
  );
  await expect
    .poll(async () => (await readSaved(page))?.drafts[customId]?.tests.length)
    .toBe(1);

  page.once("dialog", (popup) => popup.dismiss());
  await page
    .getByRole("button", { name: "Delete question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Double value revised", exact: true }),
  ).toBeVisible();
  page.once("dialog", (popup) => popup.accept());
  await page
    .getByRole("button", { name: "Delete question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Blank sandbox", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readSaved(page))?.customExercises.length)
    .toBe(0);
  expect((await readSaved(page))?.drafts[customId]).toBeUndefined();
  expect((await readSaved(page))?.drafts["balanced-brackets"].source).toBe(
    'print("independent second draft")\n',
  );
});

test("keyboard execution, multiline input, panel resizing, font preference, and reset confirmation", async ({
  page,
}) => {
  test.setTimeout(PYTHON_OPERATION_TIMEOUT_MS + 30_000);
  await page.goto("/");
  await chooseQuestion(page, "Blank sandbox");
  const questionResize = page.getByRole("separator", {
    name: "Resize question panel",
  });
  await questionResize.focus();
  await page.keyboard.press("ArrowRight");
  await expect(questionResize).toHaveAttribute("aria-valuenow", "37");
  const outputResize = page.getByRole("separator", {
    name: "Resize output panel",
  });
  await outputResize.focus();
  await page.keyboard.press("ArrowUp");
  await expect(outputResize).toHaveAttribute("aria-valuenow", "280");
  await page.getByLabel("Editor options", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Editor font size" })
    .selectOption("17");
  await page.getByRole("tab", { name: "Console", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Tests/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Input", exact: true }),
  ).toBeFocused();
  await page.getByLabel("Standard input", { exact: false }).fill("Ada\n42\n");
  const source = 'name = input()\nage = input()\nprint(name + ":" + age)\n';
  await editSource(page, source);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectPythonStatus(page, "Completed");
  await expect(page.locator(".console-output")).toHaveText("Ada:42\n");
  await expect
    .poll(async () => (await readSaved(page))?.drafts.sandbox?.source)
    .toBe(source);
  await page.reload();
  await page.getByLabel("Editor options", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Editor font size" }),
  ).toHaveValue("17");
  await expect(questionResize).toHaveAttribute("aria-valuenow", "37");
  await expect(outputResize).toHaveAttribute("aria-valuenow", "280");
  await page.getByRole("tab", { name: "Input", exact: true }).click();
  await expect(page.getByLabel("Standard input", { exact: false })).toHaveValue(
    "Ada\n42\n",
  );
  page.once("dialog", (popup) => popup.dismiss());
  await page.getByLabel("Editor options", { exact: true }).click();
  await page.getByRole("button", { name: "Reset code", exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "name = input()",
  );
  page.once("dialog", (popup) => popup.accept());
  await page.getByRole("button", { name: "Reset code", exact: true }).click();
  await expect
    .poll(async () => (await readSaved(page))?.drafts.sandbox?.source)
    .toBe(sandboxExercise.starterCode);
});

test("timer presets, pause/resume, refresh, shared session, and overtime use wall-clock time", async ({
  page,
}) => {
  const fixed = new Date("2026-09-18T14:00:00Z");
  await page.clock.install({ time: fixed });
  await page.clock.pauseAt(new Date(fixed.getTime() + 10_000));
  await page.goto("/");
  const timer = page.getByRole("timer");
  await expect(timer).toHaveText("45:00");
  await page.getByRole("button", { name: "Configure timer" }).click();
  await page.getByRole("button", { name: "30 min", exact: true }).click();
  await expect(timer).toHaveText("30:00");
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await page.clock.fastForward(60_000);
  await expect(timer).toHaveText("29:00");
  await page.getByRole("button", { name: "Pause timer", exact: true }).click();
  await page.clock.fastForward(120_000);
  await expect(timer).toHaveText("29:00");
  await page.getByRole("button", { name: "Resume timer", exact: true }).click();
  await page.clock.runFor(1_000);
  await expect(timer).toHaveText("28:59");
  await page.reload();
  await expect(timer).toHaveText("28:59");
  await expect(
    page.getByRole("button", { name: "Pause timer", exact: true }),
  ).toBeVisible();
  await chooseQuestion(page, "Binary search");
  await expect(timer).toHaveText("28:59");
  await page.getByRole("button", { name: "Configure timer" }).click();
  await page.getByLabel("Custom minutes", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(timer).toHaveText("01:00");
  await page.getByRole("button", { name: "Start timer", exact: true }).click();
  await page.clock.fastForward(61_000);
  await expect(timer).toHaveText("+00:01");
  await expect(page.locator(".time-banner")).toContainText("Time’s up");
  await expect(page.locator(".run-button")).toBeEnabled();
  await page.getByRole("button", { name: "Pause timer", exact: true }).click();
  await page.clock.fastForward(5_000);
  await expect(timer).toHaveText("+00:01");
  await page.getByRole("button", { name: "Resume timer", exact: true }).click();
  await page.clock.runFor(1_000);
  await expect(timer).toHaveText("+00:02");
  await page.getByRole("button", { name: "Reset timer", exact: true }).click();
  await expect(timer).toHaveText("01:00");
  await expect(page.locator(".time-banner")).not.toBeVisible();
  await page.getByRole("button", { name: "Configure timer" }).click();
  await page.getByRole("button", { name: "60 min", exact: true }).click();
  await expect(timer).toHaveText("01:00:00");
});

test("failed browser recovery cache keeps database saves and editor usable", async ({
  page,
}) => {
  test.setTimeout(PYTHON_OPERATION_TIMEOUT_MS + 30_000);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await editSource(page, 'print("still in memory")\n');
  await expect(page.locator(".project-save-banner")).toContainText(
    "Browser recovery",
  );
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "still in memory",
  );
  await page.keyboard.press("ControlOrMeta+Enter");
  await expectPythonStatus(page, "Completed");
  await expect(page.locator(".console-output")).toHaveText("still in memory\n");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBeNull();
});

test("invalid legacy state is preserved even after changing the new project", async ({
  page,
}) => {
  const original = '{"version":999,"valuableCode":"keep this original record"}';
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: original,
  });
  await page.goto("/");
  await expect(page.locator(".project-save-banner")).toContainText(
    "original browser entries have been preserved",
  );
  // Let the autosave debounce elapse; this explicitly checks that no write occurs.
  await page.waitForTimeout(600);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe(original);
  await editSource(page, 'print("new session")\n');
  await expect
    .poll(async () => (await readSaved(page))?.drafts?.["pair-sum"]?.source)
    .toBe('print("new session")\n');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe(original);
});

test("Monaco keyboard undo, redo, find, and replace operate on the saved source", async ({
  page,
}) => {
  const initialSource = 'print("needle")\nprint("needle")\n';
  const state = defaultSession();
  state.activeId = "sandbox";
  state.drafts.sandbox = { source: initialSource, stdin: "", tests: [] };
  await page.addInitScript(
    ({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)),
    { key: STORAGE_KEY, saved: state },
  );
  await page.goto("/");
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 30, y: 12 } });
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End",
  );
  await page.keyboard.insertText("x");
  await expect
    .poll(async () => (await readSaved(page))?.drafts.sandbox?.source)
    .toBe(initialSource + "x");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect
    .poll(async () => (await readSaved(page))?.drafts.sandbox?.source)
    .toBe(initialSource);
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y",
  );
  await expect
    .poll(async () => (await readSaved(page))?.drafts.sandbox?.source)
    .toBe(initialSource + "x");
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByRole("textbox", { name: "Find", exact: true }).fill("needle");
  await expect(page.locator(".find-widget .matchesCount")).toContainText(
    "of 2",
  );
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Alt+f" : "Control+h",
  );
  await page
    .getByRole("textbox", { name: "Replace", exact: true })
    .fill("thread");
  await page.getByRole("button", { name: /^Replace All/ }).click();
  await expect
    .poll(async () => (await readSaved(page))?.drafts.sandbox?.source)
    .toBe(initialSource.replaceAll("needle", "thread") + "x");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Find", exact: true }),
  ).not.toBeVisible();
});

test("desktop and narrow layouts stay within the viewport and expose separate mobile panes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "pair_sum",
  );
  await expect(
    page.getByRole("heading", { name: "Pair sum", exact: true }),
  ).toBeVisible();
  const library = page.getByRole("button", { name: "Practice library" });
  await library.click();
  await expect(
    page.getByRole("textbox", { name: "Search exercises" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(library).toBeFocused();
  await library.click();
  await page.getByRole("button", { name: "Close practice library" }).click();
  await expect(library).toBeFocused();
  await page.screenshot({
    path: "artifacts/workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("tabpanel", { name: "Code", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Brief", exact: true }),
  ).not.toBeVisible();
  const codeTab = page.getByRole("tab", { name: "Code", exact: true });
  const questionTab = page.getByRole("tab", {
    name: "Brief",
    exact: true,
  });
  await expect(codeTab).toHaveAttribute("aria-selected", "true");
  await expect(codeTab).toHaveAttribute("aria-controls", "coding-panel");
  await expect(questionTab).toHaveAttribute("aria-selected", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/workspace-mobile-code.png",
    fullPage: true,
  });
  await codeTab.focus();
  await page.keyboard.press("ArrowLeft");
  const filesTab = page.getByRole("tab", { name: "Files", exact: true });
  await expect(filesTab).toBeFocused();
  await expect(filesTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Files", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(questionTab).toBeFocused();
  await expect(questionTab).toHaveAttribute("aria-selected", "true");
  await expect(questionTab).toHaveAttribute("aria-controls", "question-panel");
  await expect(
    page.getByRole("heading", { name: "Pair sum", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Code", exact: true }),
  ).not.toBeVisible();
  await page.keyboard.press("End");
  const interviewTab = page.getByRole("tab", {
    name: "Interview",
    exact: true,
  });
  await expect(interviewTab).toBeFocused();
  await expect(interviewTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Interview", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(questionTab).toBeFocused();
  await expect(questionTab).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/workspace-mobile-question.png",
    fullPage: true,
  });
});
