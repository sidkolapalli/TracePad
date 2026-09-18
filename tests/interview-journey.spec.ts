import { test, expect, readProjectState, type Page } from "./fixtures";

const MINUTE = 60_000;
const TEST_CLOCK_KEY = "localpad.test-interview-now";

/** Move only the wall clock; Monaco and Python retain native performance/timers. */
async function setInterviewTime(page: Page, now: number) {
  await page.evaluate(
    ({ now, key }) => {
      (
        window as typeof window & { __testInterviewNow: number }
      ).__testInterviewNow = now;
      sessionStorage.setItem(key, String(now));
    },
    { now, key: TEST_CLOCK_KEY },
  );
}

async function installInterviewClock(page: Page) {
  await page.addInitScript(
    ({ initial, key }) => {
      const NativeDate = Date;
      const testWindow = window as typeof window & {
        __testInterviewNow: number;
      };
      const restored = sessionStorage.getItem(key);
      testWindow.__testInterviewNow =
        restored === null ? initial : Number(restored);
      class InterviewDate extends NativeDate {
        constructor(...args: unknown[]) {
          super();
          return Reflect.construct(
            NativeDate,
            args.length ? args : [testWindow.__testInterviewNow],
            new.target,
          );
        }
        static now() {
          return testWindow.__testInterviewNow;
        }
      }
      window.Date = InterviewDate as typeof Date;
    },
    { initial: Date.parse("2026-09-18T14:00:00Z"), key: TEST_CLOCK_KEY },
  );
}

async function activeAttempt(page: Page) {
  const { learning } = await readProjectState(page);
  return learning.attempts.find((a) => a.id === learning.activeAttemptId)!;
}

async function editCode(page: Page, source: string, filename = "main.py") {
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page
      .getByRole("tablist", { name: "Open files" })
      .getByRole("tab", { name: filename, exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const input = page.getByRole("textbox", {
    name: "Python code editor",
    exact: true,
  });
  await input.focus();
  await expect(input).toBeFocused();
  await input.press("ControlOrMeta+A");
  // Paste a complete source file so Monaco does not auto-indent each inserted line.
  await page.locator(".monaco-editor").evaluate((editor, text) => {
    const target = editor.ownerDocument.activeElement;
    if (!target || !editor.contains(target))
      throw new Error("The code editor is not focused");
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, source);
  await expect
    .poll(async () => {
      const { session } = await readProjectState(page);
      const draft = session.drafts[session.activeId];
      const saved =
        !draft.activeFile || draft.activeFile === "main.py"
          ? draft.source
          : draft.files?.[draft.activeFile];
      return saved?.replaceAll("\r\n", "\n");
    })
    .toBe(source);
}

async function startMock(page: Page) {
  page.setDefaultTimeout(15_000);
  await installInterviewClock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page
    .getByRole("radio", { name: "60-minute mock interview", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Start 60-minute mock", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Interview", exact: true }).click();
  await expect
    .poll(async () => (await readProjectState(page)).learning.attempts.length)
    .toBe(1);
  return activeAttempt(page);
}

test("one complete mock preserves reasoning, module execution, follow-up work and an immutable debrief", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const initial = await startMock(page);
  expect(initial.source).toBe("");
  expect(initial.durationMs).toBe(60 * MINUTE);
  await expect(
    page.getByRole("button", { name: "Pause timer", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reset timer", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Check baseline", exact: true }),
  ).toHaveCount(0);

  const clarification =
    "IDs are strings. Borrower matching is exact. A rejected operation must leave the library unchanged.";
  const approach =
    "Each Library owns dictionaries of Item and Loan objects. Validate before mutation; dispatch max_days on each item. Reports return fresh sorted lists.";
  await page
    .getByLabel("Clarifying questions & assumptions", { exact: true })
    .fill(clarification);
  await setInterviewTime(page, initial.startedAt + 2 * MINUTE);
  await page.getByRole("button", { name: "Approach", exact: true }).click();
  await page
    .getByLabel("Approach & clarifying questions", { exact: true })
    .fill(approach);

  // A candidate can reason visually without leaving or resetting the timed attempt.
  await page.getByRole("tab", { name: "Scratchpad", exact: true }).click();
  await page.getByRole("tab", { name: "Trace table", exact: true }).click();
  await page
    .getByLabel("Row 1, Step", { exact: true })
    .fill("borrow camera at day 10");
  await page
    .getByLabel("Row 1, Variables", { exact: true })
    .fill("active = {'camera': loan}");
  await page
    .getByLabel("Row 1, Observation", { exact: true })
    .fill("Duplicate borrow raises; original loan survives.");
  await page.getByRole("tab", { name: "Flowchart", exact: true }).click();
  await page.getByRole("button", { name: "Add start", exact: true }).click();
  await page
    .getByLabel("Step label", { exact: true })
    .fill("Validate requested item");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page
    .getByLabel("Step label", { exact: true })
    .fill("Create and store Loan");
  await page
    .getByRole("combobox", { name: "Select a step or connection", exact: true })
    .selectOption({ label: "1. Validate requested item" });
  await page
    .getByRole("combobox", { name: "Connect to", exact: true })
    .selectOption({ label: "Create and store Loan" });
  await page
    .locator(".flow-connect-fields")
    .getByRole("button", { name: "Connect", exact: true })
    .click();
  await expect(page.locator(".flow-edge")).toHaveCount(1);

  await setInterviewTime(page, initial.startedAt + 7 * MINUTE);
  await page.getByRole("tab", { name: "Interview", exact: true }).click();
  await page.getByRole("button", { name: "Code & test", exact: true }).click();
  await expect(
    page.getByRole("timer", { name: "Session time remaining" }),
  ).toHaveText("53:00");
  await page.screenshot({
    path: "artifacts/mock-journey-desktop.png",
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByLabel("File path", { exact: true }).fill("domain.py");
  await page.getByRole("button", { name: "Create file", exact: true }).click();
  // Creating a file returns keyboard focus to its Explorer row on the next
  // frame. Let that visible interaction finish before moving into the editor.
  await expect(
    page.getByRole("treeitem", { name: "domain.py", exact: true }),
  ).toBeFocused();
  // The reference is read only by this isolated test fixture, never revealed in the candidate UI.
  await editCode(page, initial.question.referenceSolution, "domain.py");
  const files = page.getByRole("tablist", { name: "Open files" });
  await files.getByRole("tab", { name: "main.py", exact: true }).click();
  await editCode(
    page,
    "from domain import Item, ShortLoanItem, Loan, Library\n\ndesk = Library()\ndesk.add(Item('camera', 'Camera'))\nprint(desk.available_ids())",
  );
  await page.locator(".run-button").click();
  await expect(page.locator(".console-output")).toHaveText("['camera']\n", {
    timeout: 30_000,
  });

  await setInterviewTime(page, initial.startedAt + 40 * MINUTE);
  await page.getByRole("tab", { name: "Interview", exact: true }).click();
  await page.getByRole("button", { name: "Follow-up", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Additional requirements" }),
  ).toContainText("loans_for");
  await page
    .getByRole("button", { name: "Acknowledge requirement", exact: true })
    .click();
  const followupResponse =
    "Filter active loans by exact borrower and sort by due day then item ID. Return a new list retaining the original Loan references; test mutation and returning an item.";
  await page
    .getByLabel("Follow-up response & tradeoffs", { exact: true })
    .fill(followupResponse);
  await page.locator(".mock-assistance > summary").click();
  await page.getByRole("button", { name: "Hint 1/3", exact: true }).click();
  expect((await activeAttempt(page)).hintsUsed).toHaveLength(0);
  await page.getByRole("button", { name: "Reveal hint", exact: true }).click();
  await expect
    .poll(async () => (await activeAttempt(page)).hintsUsed.length)
    .toBe(1);

  await files.getByRole("tab", { name: "domain.py", exact: true }).click();
  const extension =
    "\n    def loans_for(self, borrower):\n        return sorted(\n            (loan for loan in self._loans.values() if loan.borrower == borrower),\n            key=lambda loan: (loan.due_day, loan.item.item_id),\n        )\n";
  await editCode(
    page,
    initial.question.referenceSolution + extension,
    "domain.py",
  );
  await files.getByRole("tab", { name: "main.py", exact: true }).click();
  await page.locator("#tab-tests").click();
  await page.getByRole("button", { name: "Add test", exact: true }).click();
  await page
    .getByLabel("Test name", { exact: true })
    .fill("Borrower sorting and ownership");
  await page
    .getByLabel("Assertion for Borrower sorting and ownership", { exact: true })
    .fill(
      "desk = Library()\nfor key in ('z', 'a', 'm'):\n    desk.add(Item(key, key))\nz = desk.borrow('z', 'Sam', 0)\na = desk.borrow('a', 'Sam', 0)\ndesk.borrow('m', 'Other', 0)\nassert desk.loans_for('Sam') == [a, z]\nassert desk.loans_for('sam') == []\nview = desk.loans_for('Sam')\nview.clear()\nassert desk.loans_for('Sam') == [a, z]\ndesk.return_item('a')\nassert desk.loans_for('Sam') == [z]",
    );
  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  await expect(page.locator(".test-summary")).toContainText(
    "1 passed · 0 failed",
    { timeout: 30_000 },
  );
  await expect
    .poll(async () => (await activeAttempt(page)).runs.length)
    .toBe(2);

  await setInterviewTime(page, initial.startedAt + 55 * MINUTE);
  await page.getByRole("button", { name: "Wrap up", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish & review", exact: true })
    .click();
  expect((await activeAttempt(page)).finishedAt).toBeNull();
  await setInterviewTime(page, initial.startedAt + 58 * MINUTE);
  await page
    .getByRole("button", { name: "Submit interview", exact: true })
    .click();
  await expect(page.locator(".attempt-review")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Where the time went", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-facts")).toContainText("58m 0s");
  await expect(page.locator(".review-facts")).toContainText(
    "1 hints · 0 pauses",
  );
  const submitted = await activeAttempt(page);
  const baseline = submitted.runs
    .filter((run) => run.kind === "baseline")
    .at(-1)!;
  expect(baseline.status).toBe("completed");
  expect(baseline.results.length).toBeGreaterThanOrEqual(
    initial.question.baselineTests.length,
  );
  expect(baseline.results.every((result) => result.passed)).toBe(true);
  expect(submitted.notes).toBe(approach);
  expect(submitted.scratchpad?.trace.rows[0].cells.observation).toContain(
    "Duplicate borrow",
  );
  expect(submitted.scratchpad?.flow.edges).toHaveLength(1);
  expect(submitted.files?.["domain.py"]).toContain("def loans_for");
  expect(submitted.requirementUpdates?.[0].acknowledgedAt).toBeDefined();
  expect(submitted.interviewJourney?.clarifications).toBe(clarification);
  expect(submitted.interviewJourney?.followupResponse).toBe(followupResponse);
  expect(submitted.interviewJourney?.transitions).toEqual([
    { phase: "clarify", at: initial.startedAt },
    { phase: "approach", at: initial.startedAt + 2 * MINUTE },
    { phase: "code", at: initial.startedAt + 7 * MINUTE },
    { phase: "followup", at: initial.startedAt + 40 * MINUTE },
    { phase: "wrapup", at: initial.startedAt + 55 * MINUTE },
  ]);
  const phaseTimes = page.getByRole("region", {
    name: "Time by interview phase",
    exact: true,
  });
  await expect(phaseTimes).toContainText("Code & test");
  await expect(phaseTimes).toContainText("33m 00s");
  await page
    .locator("summary")
    .filter({ hasText: /^Your test evidence/ })
    .click();
  await page
    .locator(".debrief-run > summary")
    .filter({ hasText: "Custom tests" })
    .click();
  await expect(page.locator(".debrief-run[open]")).toContainText(
    "Borrower sorting and ownership",
  );
  await expect(page.locator(".debrief-run[open]")).toContainText(
    "desk.loans_for('Sam')",
  );
  await page.getByText("Submitted scratchpad", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Submitted trace table", exact: true }),
  ).toContainText("Duplicate borrow raises; original loan survives.");
  await expect(page.locator(".attempt-review")).toContainText(
    "Validate requested item",
  );
  await expect(page.locator(".attempt-review")).toContainText(
    "Create and store Loan",
  );
  await page
    .locator("summary")
    .filter({ hasText: /^Assistance & changes/ })
    .click();
  await expect(page.locator(".attempt-review")).toContainText(
    "Follow-up: borrower view",
  );

  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page
    .getByRole("heading", { name: "Where the time went", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/mock-journey-review-light.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Review", exact: true }),
  ).toBeFocused();
  await editCode(page, "print('After submission: independent working draft')");
  await page.getByRole("tab", { name: "Scratchpad", exact: true }).click();
  await page.getByRole("tab", { name: "Trace table", exact: true }).click();
  await page
    .getByLabel("Row 1, Observation", { exact: true })
    .fill("Working draft changed after submission");
  await expect
    .poll(async () => {
      const state = await readProjectState(page);
      return state.session.drafts[state.session.activeId].scratchpad?.trace
        .rows[0].cells.observation;
    })
    .toBe("Working draft changed after submission");
  const frozen = await activeAttempt(page);
  expect(frozen.source).toBe(submitted.source);
  expect(frozen.files).toEqual(submitted.files);
  expect(frozen.scratchpad).toEqual(submitted.scratchpad);
  expect(frozen.interviewJourney).toEqual(submitted.interviewJourney);
  expect(frozen.finishedAt).toBe(submitted.finishedAt);

  await page.reload();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await page
    .locator(".attempt-history-row")
    .filter({ hasText: initial.question.title })
    .click();
  await expect(
    page.getByRole("heading", { name: "Where the time went", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-facts")).toContainText("58m 0s");
  await expect(page.locator(".review-facts")).toContainText(
    "1 hints · 0 pauses",
  );
});

test("inactive time and refresh reveal exactly one scheduled follow-up, preserve phases and allow overtime", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const initial = await startMock(page);
  await page
    .getByLabel("Clarifying questions & assumptions", { exact: true })
    .fill("Check duplicate IDs and exact borrower names.");
  await setInterviewTime(page, initial.startedAt + 8 * MINUTE);
  await page.getByRole("button", { name: "Code & test", exact: true }).click();
  await setInterviewTime(page, initial.startedAt + 39 * MINUTE);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Code & test", exact: true }),
  ).toBeVisible();
  expect((await activeAttempt(page)).requirementUpdates ?? []).toHaveLength(0);

  // Advancing wall time, rather than ticking 40 minutes of intervals, models a sleeping/inactive tab.
  await setInterviewTime(page, initial.startedAt + 42 * MINUTE);
  await page.reload();
  await expect
    .poll(async () => (await activeAttempt(page)).requirementUpdates?.length)
    .toBe(1);
  const followup = (await activeAttempt(page)).requirementUpdates![0];
  await expect(
    page.getByRole("region", { name: "Additional requirements" }),
  ).toContainText("loans_for");
  await page.reload();
  await expect
    .poll(async () => (await activeAttempt(page)).requirementUpdates?.length)
    .toBe(1);
  expect((await activeAttempt(page)).requirementUpdates![0].id).toBe(
    followup.id,
  );
  expect((await activeAttempt(page)).interviewJourney?.clarifications).toBe(
    "Check duplicate IDs and exact borrower names.",
  );
  expect((await activeAttempt(page)).interviewJourney?.transitions).toEqual([
    { phase: "clarify", at: initial.startedAt },
    { phase: "code", at: initial.startedAt + 8 * MINUTE },
  ]);

  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("tab", { name: "Interview", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/mock-journey-mobile.png",
    animations: "disabled",
  });
  await setInterviewTime(page, initial.startedAt + 62 * MINUTE);
  await page.reload();
  await expect(page.locator(".time-banner")).toContainText("Time’s up");
  await expect(page.locator(".time-banner")).not.toContainText("reset");
  await expect(
    page.getByRole("button", { name: "Open interview", exact: true }),
  ).toBeVisible();
  expect((await activeAttempt(page)).finishedAt).toBeNull();
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await editCode(page, "print('Still coding in overtime')");
  await page.locator(".run-button").click();
  await expect(page.locator(".console-output")).toHaveText(
    "Still coding in overtime\n",
    { timeout: 30_000 },
  );
  expect((await activeAttempt(page)).requirementUpdates).toHaveLength(1);
});
