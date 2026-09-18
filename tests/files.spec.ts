import { readProjectState } from "./fixtures";
import { test, expect, expectPythonStatus, type Page } from "./fixtures";
import { defaultSession, STORAGE_KEY } from "../src/session";
import {
  createAttempt,
  defaultLearning,
  LEARNING_KEY,
} from "../src/learning/state";
import { generateQuestion } from "../src/learning/curriculum";

async function edit(page: Page, source: string) {
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 24, y: 12 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(source);
}

test("project files import, keep separate undo history, rename, delete, and survive refresh independently", async ({
  page,
}) => {
  test.setTimeout(90000);
  const session = defaultSession();
  session.activeId = "sandbox";
  session.sidebarTab = "files";
  session.drafts.sandbox = {
    source: "from helpers import answer\nprint(answer + 1)",
    stdin: "",
    tests: [],
  };
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state: session },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByLabel("File path", { exact: true }).fill("../escape.py");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  await expect(page.locator(".file-action-error")).toContainText(
    "module names",
  );
  await page.getByLabel("File path", { exact: true }).fill("helpers.py");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  const files = page.getByRole("tablist", { name: "Open files" });
  await expect(
    files.getByRole("tab", { name: "helpers.py", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await edit(page, "answer = 41");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End",
  );
  await page.keyboard.insertText("#");
  await files.getByRole("tab", { name: "main.py", exact: true }).click();
  await expect(page.locator(".view-lines")).toContainText(
    "from helpers import answer",
  );
  await files.getByRole("tab", { name: "helpers.py", exact: true }).click();
  await page.locator(".view-lines").click({ position: { x: 24, y: 12 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".view-lines")).toHaveText("answer = 41");
  await page.locator(".run-button").click();
  await expectPythonStatus(page, "Completed");
  await expect(page.locator(".console-output")).toHaveText("42\n", {
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Rename helpers.py", exact: true })
    .click();
  await page.getByLabel("File path", { exact: true }).fill("models/counter.py");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "models/counter.py", exact: true }),
  ).toBeVisible();
  await files.getByRole("tab", { name: "main.py", exact: true }).click();
  await edit(page, "from models.counter import answer\nprint(answer + 1)");
  await page.locator(".run-button").click();
  await expectPythonStatus(page, "Completed");
  await expect(page.locator(".console-output")).toHaveText("42\n", {
    timeout: 30000,
  });
  await files
    .getByRole("tab", { name: "models/counter.py", exact: true })
    .click();
  await expect
    .poll(() =>
      readProjectState(page).then((s) => s.session.drafts.sandbox.activeFile),
    )
    .toBe("models/counter.py");
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Files", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    files.getByRole("tab", { name: "models/counter.py", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".view-lines")).toHaveText("answer = 41");
  await page.getByRole("tab", { name: "Brief", exact: true }).click();
  await page
    .getByRole("button", { name: "Practice library", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Binary search Arrays · Search Easy",
      exact: true,
    })
    .click();
  await expect(files.getByRole("tab")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Practice library", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Blank sandbox Free practice Sandbox",
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await expect(files.getByRole("tab")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Delete models/counter.py", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep file", exact: true }).click();
  await expect(files.getByRole("tab")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Delete models/counter.py", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete file", exact: true }).click();
  await expect(files.getByRole("tab")).toHaveCount(1);
  await expect(
    files.getByRole("tab", { name: "main.py", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(page.locator(".workspace")).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("tab", { name: "Brief", exact: true }).click();
  await expect(page.locator(".workspace")).not.toHaveClass(/sidebar-collapsed/);
});

test("sidebar and module tabs remain accessible on narrow screens in both themes", async ({
  page,
}) => {
  const session = defaultSession();
  session.activeId = "sandbox";
  session.theme = "light";
  session.drafts.sandbox = {
    source: "from domain import model",
    files: { "domain/model.py": "class Example:\n    pass" },
    activeFile: "domain/model.py",
    stdin: "",
    tests: [],
  };
  await page.addInitScript(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: STORAGE_KEY, state: session },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
    const brief = page.getByRole("tab", { name: "Brief", exact: true });
    await brief.click();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Files", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("treeitem", { name: "domain/model.py", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `artifacts/files-mobile-${theme}.png` });
    await page
      .getByRole("treeitem", { name: "domain/model.py", exact: true })
      .click();
    await expect(
      page.getByRole("tab", { name: "Code", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".view-lines")).toContainText("class Example");
  }
});

test("recovered learning projects keep all files on edit and recreated files have clean undo history", async ({
  page,
}) => {
  const attempt = createAttempt(
    generateQuestion("python.oop.instance-state", "foundation", 0),
    "drill",
    15,
  );
  attempt.source = "from helper import value\nprint(value)";
  attempt.files = { "helper.py": "value = 41" };
  attempt.activeFile = "helper.py";
  const session = defaultSession();
  session.activeId = `attempt-${attempt.id}`;
  session.sidebarTab = "files";
  // Only learning storage has the project: the workspace draft must recover it.
  await page.addInitScript(
    ({ session, attempt, sessionKey, learningKey, learning }) => {
      localStorage.setItem(sessionKey, JSON.stringify(session));
      localStorage.setItem(
        learningKey,
        JSON.stringify({
          ...learning,
          activeAttemptId: attempt.id,
          attempts: [attempt],
        }),
      );
    },
    {
      session,
      attempt,
      sessionKey: STORAGE_KEY,
      learningKey: LEARNING_KEY,
      learning: defaultLearning(),
    },
  );
  await page.goto("/");
  await expect(page.locator(".view-lines")).toHaveText("value = 41");
  await edit(page, "value = 42");
  await expect
    .poll(() =>
      readProjectState(page).then((s) => s.session.drafts[s.session.activeId]),
    )
    .toMatchObject({
      source: attempt.source,
      files: { "helper.py": "value = 42" },
    });
  await page.locator(".view-lines").click({ position: { x: 24, y: 12 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await expect(page.locator(".view-lines")).toHaveText("");
  await page
    .getByRole("button", { name: "Delete helper.py", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete file", exact: true }).click();
  await expect(
    page.getByRole("tablist", { name: "Open files" }).getByRole("tab"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByLabel("File path", { exact: true }).fill("helper.py");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  await page.locator(".view-lines").click({ position: { x: 24, y: 12 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".view-lines")).toHaveText("");
});
