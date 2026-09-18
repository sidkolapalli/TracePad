import { test, expect, type Page, readProjectState } from "./fixtures";
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
async function openProjectPicker(page: Page) {
  if (!(await page.locator(".project-picker").isVisible()))
    await page.locator(".workspace-project-title").click();
  await expect(
    page.getByRole("dialog", { name: "Switch project", exact: true }),
  ).toBeVisible();
}
async function openProjectDetails(page: Page) {
  await openProjectPicker(page);
  await page
    .getByRole("button", { name: "Project details", exact: true })
    .click();
}
async function createProject(page: Page, name: string) {
  await openProjectPicker(page);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill(name);
  await page.getByLabel("Company optional").fill("Example team");
  await page.getByLabel("Role optional").fill("Python engineer");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".workspace-project-title strong")).toHaveText(
    name,
  );
}
test("projects isolate modules, drafts, stdin, tests, preferences, and survive refresh", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await edit(page, "print('first project')");
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByLabel("File path", { exact: true }).fill("helpers.py");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  await edit(page, "answer = 42");
  await page.getByRole("tab", { name: "Input", exact: true }).click();
  await page.getByLabel("Standard input").fill("first\nsecond");
  await createProject(page, "Platform interview");
  await expect(
    page.getByRole("tab", { name: "helpers.py", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".view-lines")).toContainText("def pair_sum");
  await edit(page, "print('second project')");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Interview practice/ })
    .click();
  await expect(page.locator(".view-lines")).toContainText("answer = 42");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("tab", { name: "Input", exact: true }).click();
  await expect(page.getByLabel("Standard input")).toHaveValue("first\nsecond");
  await page.reload();
  await expect(page.locator(".view-lines")).toContainText("answer = 42");
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Platform interview/ })
    .click();
  await expect(page.locator(".view-lines")).toContainText(
    "print('second project')",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("project details, archive/restore and backup round-trip preserve work", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await createProject(page, "Systems interview");
  await edit(page, "print('backup survives')");
  await openProjectDetails(page);
  await page
    .getByLabel("Preparation notes optional")
    .fill("Review OOP and edge cases");
  await page.getByLabel("Interview date optional").fill("2026-09-23");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await openProjectPicker(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await downloadPromise,
    path = await download.path();
  expect(path).toBeTruthy();
  await openProjectDetails(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(page.locator(".workspace-project-title strong")).toHaveText(
    "Interview practice",
  );
  await openProjectPicker(page);
  await page
    .getByRole("button", { name: "View archived", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Archived projects" })
    .getByRole("button", { name: /Systems interview/ })
    .click();
  await expect(page.locator(".view-lines")).toContainText("backup survives");
  await openProjectDetails(page);
  await expect(page.getByLabel("Preparation notes optional")).toHaveValue(
    "Review OOP and edge cases",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const previousProjectId = await page.evaluate(() =>
    localStorage.getItem("localpad.active-project.v1"),
  );
  await openProjectPicker(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import backup", exact: true })
    .click();
  await (await chooserPromise).setFiles(path!);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("localpad.active-project.v1")),
    )
    .not.toBe(previousProjectId);
  await openProjectPicker(page);
  await expect(
    page
      .getByRole("navigation", { name: "Projects", exact: true })
      .getByRole("button", { name: /Systems interview/ }),
  ).toHaveCount(2);
  await expect(page.locator(".view-lines")).toContainText("backup survives");
});
test("a failed save blocks switching, preserves edits across refresh, and retries", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await createProject(page, "Another interview");
  await page.route("**/api/projects/*/state", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Test database temporarily unavailable" },
    }),
  );
  await edit(page, "print('keep unsaved work')");
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Interview practice/ })
    .click();
  await expect(page.locator(".workspace-project-title strong")).toHaveText(
    "Another interview",
  );
  await page.reload();
  await expect(page.locator(".view-lines")).toContainText("keep unsaved work");
  await page.unroute("**/api/projects/*/state");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(
    page.getByRole("button", { name: "Retry save" }),
  ).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".view-lines")).toContainText("keep unsaved work");
});
test("another tab cannot erase a failed save's recovery cache", async ({
  page,
  context,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".monaco-editor")).toBeVisible();
  await page.route("**/api/projects/*/state", (route) =>
    route.fulfill({ status: 503, json: { error: "Save interrupted" } }),
  );
  await edit(page, "print('only in the first tab')");
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await other.close();
  await page.reload();
  await expect(page.locator(".view-lines")).toContainText(
    "only in the first tab",
  );
  await page.unroute("**/api/projects/*/state");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(
    page.getByRole("button", { name: "Retry save" }),
  ).not.toBeVisible();
});
test("switching locks the editor until the next project is loaded", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await createProject(page, "Switch target");
  const id = await page.evaluate(() =>
    localStorage.getItem("localpad.active-project.v1"),
  );
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Interview practice/ })
    .click();
  await edit(page, "print('before switching')");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/projects/${id}`, async (route) => {
    await barrier;
    await route.continue();
  });
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Switch target/ })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  await page.keyboard.insertText("must not reach editor");
  release();
  await expect(page.locator(".workspace-project-title strong")).toHaveText(
    "Switch target",
  );
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Interview practice/ })
    .click();
  await expect(page.locator(".view-lines")).toHaveText(
    "print('before switching')",
  );
});
test("concurrent changes produce a recovery copy without overwriting either version", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem("localpad.active-project.v1"),
  );
  const document = await (await page.request.get(`/api/projects/${id}`)).json();
  document.state.session.drafts[document.state.session.activeId] = {
    source: "print('other tab')",
    stdin: "",
    tests: [],
  };
  const saved = await page.request.put(`/api/projects/${id}/state`, {
    headers: { "X-Localpad": "1" },
    data: {
      expectedRevision: document.revision,
      saveId: "concurrent-tab",
      state: document.state,
    },
  });
  expect(saved.ok()).toBeTruthy();
  await edit(page, "print('my edits')");
  await expect(
    page.getByRole("button", { name: "Save recovery copy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save recovery copy" }).click();
  await expect(page.locator(".workspace-project-title strong")).toContainText(
    "recovery",
  );
  await expect(page.locator(".view-lines")).toContainText("my edits");
  const original = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(
    original.state.session.drafts[document.state.session.activeId].source,
  ).toBe("print('other tab')");
});
test("legacy mock history imports and its deadline continues across projects", async ({
  page,
}) => {
  const session = defaultSession(),
    learning = defaultLearning(),
    attempt = createAttempt(
      generateQuestion("python.oop.instance-state", "foundation", 44),
      "mock",
      60,
    );
  attempt.notes = "Keep objects independent";
  learning.attempts = [attempt];
  learning.activeAttemptId = attempt.id;
  session.activeId = `attempt-${attempt.id}`;
  session.timer = {
    durationMs: 3600000,
    remainingMs: 3600000,
    deadline: attempt.deadline,
    started: true,
  };
  await page.addInitScript(
    ({ session, learning }) => {
      if (!localStorage.getItem("localpad.active-project.v1")) {
        localStorage.setItem("localpad.session.v1", JSON.stringify(session));
        localStorage.setItem("localpad.learning.v1", JSON.stringify(learning));
      }
    },
    { session, learning },
  );
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await createProject(page, "Second interview");
  expect((await readProjectState(page)).learning.attempts).toHaveLength(0);
  await openProjectPicker(page);
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: /Interview practice/ })
    .click();
  await expect(page.locator(".workspace-project-title strong")).toHaveText(
    "Interview practice",
  );
  const restored = await readProjectState(page);
  expect(restored.learning.attempts[0].notes).toBe(attempt.notes);
  expect(restored.learning.attempts[0].finishedAt).toBeNull();
  expect(restored.session.timer.deadline).toBe(attempt.deadline);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      LEARNING_KEY,
    ),
  ).toEqual(learning);
});
test("narrow layout provides project navigation, keyboard dialog, and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await openProjectPicker(page);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await openProjectPicker(page);
  await page.getByRole("button", { name: "Close project navigation" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({ path: "artifacts/projects-mobile-light.png" });
});
