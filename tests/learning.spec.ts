import { readProjectState } from "./fixtures";
import { test, expect, type Page } from "./fixtures";
import {
  defaultSession,
  STORAGE_KEY,
  startTimer,
  resetTimer,
} from "../src/session";
import {
  createAttempt,
  defaultLearning,
  LEARNING_KEY,
} from "../src/learning/state";
import { generateQuestion } from "../src/learning/curriculum";
import type { LearningState, PracticeMode } from "../src/learning/types";

async function saved(page: Page): Promise<LearningState> {
  return (await readProjectState(page)).learning;
}
async function seed(page: Page, mode: PracticeMode = "drill") {
  const question = generateQuestion(
    "python.oop.instance-state",
    "foundation",
    10,
    mode,
  );
  const attempt = createAttempt(question, mode, mode === "mock" ? 60 : 15);
  if (mode === "drill") attempt.source = question.referenceSolution;
  const learning = {
    ...defaultLearning(),
    activeAttemptId: attempt.id,
    attempts: [attempt],
  };
  const session = defaultSession();
  session.activeId = `attempt-${attempt.id}`;
  session.drafts[session.activeId] = {
    source: attempt.source,
    stdin: "",
    tests: [{ id: "scratch", name: "My exploration", code: "assert True" }],
  };
  session.timer = startTimer(resetTimer(session.timer, attempt.durationMs));
  await page.addInitScript(
    ({ session, learning, sessionKey, learningKey }) => {
      if (!localStorage.getItem(sessionKey)) {
        localStorage.setItem(sessionKey, JSON.stringify(session));
        localStorage.setItem(learningKey, JSON.stringify(learning));
      }
    },
    { session, learning, sessionKey: STORAGE_KEY, learningKey: LEARNING_KEY },
  );
  await page.goto("/");
  await page.getByRole("tab", { name: "Interview", exact: true }).click();
  return attempt;
}

test("topic attempt preserves evidence, notes and hints; fixed baseline is separate from scratch tests", async ({
  page,
}) => {
  test.setTimeout(120000);
  const attempt = await seed(page);
  await page.screenshot({ path: "artifacts/learning-workspace-desktop.png" });
  await page
    .getByLabel("Approach & clarifying questions")
    .fill("Each object owns its own state. What happens on an empty queue?");
  await page.getByRole("button", { name: "Hint 1/3", exact: true }).click();
  await page.getByRole("button", { name: "Pause timer", exact: true }).click();
  await page.getByRole("button", { name: "Resume timer", exact: true }).click();
  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  await expect(page.locator(".test-summary")).toContainText("1 passed");
  await expect
    .poll(async () => (await saved(page)).attempts[0].runs.length)
    .toBe(1);
  expect((await saved(page)).attempts[0].runs[0].kind).toBe("scratch");
  await page
    .getByRole("button", { name: "Check baseline", exact: true })
    .click();
  await expect(page.locator(".output-status")).toContainText("Completed", {
    timeout: 30000,
  });
  await expect
    .poll(async () => (await saved(page)).attempts[0].runs.length)
    .toBe(2);
  let a = (await saved(page)).attempts[0];
  expect(a.runs[1].tests).toEqual(attempt.question.baselineTests);
  expect(a.runs[1].results.every((r) => r.passed)).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Approach & clarifying questions")).toHaveValue(
    a.notes,
  );
  await expect(page.locator(".revealed-hints")).toContainText(
    attempt.question.hints[0],
  );
  await page
    .getByRole("button", { name: "Finish & review", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".review-facts")).toContainText(
    `${attempt.question.baselineTests.length}/${attempt.question.baselineTests.length}`,
  );
  await expect(page.locator(".review-facts")).toContainText(
    "1 hints · 1 pauses",
  );
  await page.getByLabel("I explained my approach before coding").check();
  await expect
    .poll(async () => (await saved(page)).attempts[0].finishedAt)
    .not.toBeNull();
  await expect
    .poll(async () => (await saved(page)).attempts[0].selfCheck.explained)
    .toBe(true);
  a = (await saved(page)).attempts[0];
  expect(a.source).toBe(attempt.question.referenceSolution);
  expect(a.runs).toHaveLength(3);
  // Changing the working editor after submission must not rewrite the reviewed attempt.
  await page.keyboard.press("Escape");
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 30, y: 12 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('print("after submission")');
  await expect
    .poll(async () =>
      (async () => {
        const s = (await readProjectState(page)).session;
        return s.drafts[s.activeId].source;
      })(),
    )
    .toBe('print("after submission")');
  expect((await saved(page)).attempts[0].source).toBe(a.source);
});

test("mock starts blank, keeps a strict hour and saves an unfinished solution honestly", async ({
  page,
}) => {
  const a = await seed(page, "mock");
  await expect(
    page.getByRole("button", { name: "Configure timer" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Pause timer", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reset timer", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Check baseline", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".learning-mode")).toContainText(
    "60-minute mock interview",
  );
  expect(a.source).toBe("");
  await page
    .getByRole("button", { name: "Finish & review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit interview", exact: true })
    .click();
  await expect(page.locator(".attempt-review")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".review-facts")).toContainText(
    `0/${a.question.baselineTests.length}`,
  );
  await expect(page.locator(".review-facts")).toContainText(
    "First successful runNot recorded",
  );
});

test("narrow practice navigation is keyboard accessible without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "artifacts/learning-setup-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Practice", exact: true }),
  ).toBeFocused();
});

test("local question preparation starts a mock and cannot inherit an open timer menu", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Configure timer" }).click();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page
    .getByRole("radio", { name: "60-minute mock interview", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Start 60-minute mock", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 30000 });
  await expect(page.locator(".learning-mode")).toContainText(
    "60-minute mock interview",
  );
  await expect(page.locator(".timer-popover")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause timer", exact: true }),
  ).toBeDisabled();
  await expect.poll(async () => (await saved(page)).attempts.length).toBe(1);
  const a = (await saved(page)).attempts[0];
  expect(a.mode).toBe("mock");
  expect(a.source).toBe("");
  expect(a.question.provenance.kind).toBe("local-template");
  expect(a.durationMs).toBe(3600000);
  await page.reload();
  await expect(page.locator(".learning-mode")).toContainText(
    "60-minute mock interview",
  );
  const s = (await readProjectState(page)).session;
  expect(s.timer.deadline).not.toBeNull();
});
