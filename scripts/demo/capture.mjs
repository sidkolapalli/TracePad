/**
 * Film a real, isolated production integration test. This does not automate the
 * user's browser, alter clocks, or manufacture results. --coaching pauses for
 * genuine replies sent by the external Codex agent through the MCP server.
 * Run the companion seed first, then:
 *   node scripts/demo/capture.mjs --run-id <isolated-run-uuid>
 * Optional --fast rehearses the same assertions without editorial reading holds.
 */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const runId = process.argv[process.argv.indexOf("--run-id") + 1];
if (
  !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
    runId ?? "",
  )
)
  throw new Error("Supply the isolated server run ID with --run-id.");
const fast = process.argv.includes("--fast");
const coaching = process.argv.includes("--coaching");
const resumeFinish = process.argv.includes("--resume-finish");
const resumeAI = process.argv.includes("--resume-ai") || resumeFinish;
if (resumeAI && !coaching) throw new Error("--resume-ai requires --coaching.");
const origin = "http://127.0.0.1:54173";
const output = resolve(
  "artifacts/demo",
  resumeFinish
    ? "capture-finish"
    : resumeAI
      ? "capture-continuation"
      : fast
        ? "rehearsal"
        : "capture",
);
await mkdir(output, { recursive: true });
const identityResponse = await fetch(`${origin}/__localpad_e2e__/identity`);
if (!identityResponse.ok) throw new Error("No isolated production server.");
const identity = await identityResponse.json();
expect(identity).toMatchObject({
  runId,
  mode: "production",
  databaseFile: resolve(".localpad/playwright", runId, "projects.sqlite"),
  tokenFile: resolve(".localpad/playwright", runId, "bridge-token"),
});
const projects = (await (await fetch(`${origin}/api/projects`)).json())
  .projects;
const workspace = projects.find((p) => /Wednesday/i.test(p.name));
if (!workspace || projects.length !== 3)
  throw new Error(
    "Expected only the three clean seeded demo projects, including Wednesday.",
  );
const initialDocument = await (
  await fetch(`${origin}/api/projects/${workspace.id}`)
).json();
if (initialDocument.state.learning.attempts.length && !resumeAI)
  throw new Error("Seed must be freshly reset before recording.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  locale: "en-US",
  reducedMotion: "no-preference",
  serviceWorkers: "block",
  recordVideo: { dir: output, size: { width: 1440, height: 900 } },
});
await context.addInitScript((id) => {
  if (!localStorage.getItem("localpad.active-project.v1"))
    localStorage.setItem("localpad.active-project.v1", id);
}, workspace.id);
const outsideRequests = [];
await context.route("**/*", async (route) => {
  if (new URL(route.request().url()).origin !== origin) {
    outsideRequests.push(route.request().url());
    return route.abort("internetdisconnected");
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let instanceId;
let lastAgentSeenAt;
page.on("response", async (response) => {
  if (response.url().endsWith("/api/localpad/sync")) {
    const data = await response.json().catch(() => ({}));
    if (data.lastAgentSeenAt) lastAgentSeenAt = data.lastAgentSeenAt;
  }
});
page.on("request", (request) => {
  if (
    request.url().endsWith("/api/localpad/sync") &&
    request.method() === "POST"
  ) {
    const snapshot = request.postDataJSON()?.snapshot;
    if (snapshot?.instanceId) instanceId = snapshot.instanceId;
  }
});
const started = performance.now();
const chapters = [];
const evidence = {
  project: workspace.name,
  viewport: { width: 1440, height: 900 },
  clock: "Real wall clock, unmodified",
  errors,
  outsideRequests,
};
const coachWaits = [];
async function coachSignal(phase, isWait = true) {
  await expect.poll(() => instanceId).toBeTruthy();
  const active = await attempt();
  const signal = {
    phase,
    instanceId,
    projectId: workspace.id,
    attemptId: active?.id,
    recordingSeconds: +((performance.now() - started) / 1000).toFixed(3),
  };
  await writeFile(
    resolve("artifacts/demo/coach-request.json"),
    JSON.stringify(signal, null, 2),
  );
  console.log(`COACH_REQUEST ${JSON.stringify(signal)}`);
  if (isWait) coachWaits.push({ phase, startSeconds: signal.recordingSeconds });
}
async function coachDone() {
  coachWaits.at(-1).endSeconds = +(
    (performance.now() - started) /
    1000
  ).toFixed(3);
  await writeFile(
    resolve(output, "waits.json"),
    JSON.stringify(coachWaits, null, 2),
  );
}
const hold = (ms) => page.waitForTimeout(fast ? Math.min(ms, 90) : ms);
const chapter = async (id, title, ms = 3200) => {
  chapters.push({
    id,
    title,
    startSeconds: +((performance.now() - started) / 1000).toFixed(3),
  });
  console.log(`CHAPTER ${chapters.at(-1).startSeconds}s ${title}`);
  await page.screenshot({
    path: resolve(
      output,
      `${String(chapters.length).padStart(2, "0")}-${id}.png`,
    ),
  });
  await hold(ms);
};
const click = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await hold(350);
  await locator.click();
  await hold(550);
};
const button = (name) => page.getByRole("button", { name, exact: true });
const tab = (name) => page.getByRole("tab", { name, exact: true });
async function state() {
  return page.evaluate(async () => {
    const id = localStorage.getItem("localpad.active-project.v1");
    const cache = localStorage.getItem(
      `localpad.project.v1.${id}.${sessionStorage.getItem("localpad.recovery-client.v1")}`,
    );
    return cache
      ? JSON.parse(cache).state
      : (await (await fetch(`/api/projects/${id}`)).json()).state;
  });
}
async function attempt() {
  const { learning } = await state();
  return learning.attempts.find((a) => a.id === learning.activeAttemptId);
}
async function fill(label, text) {
  const input = page.getByLabel(label, { exact: label !== "Standard input" });
  await input.fill(text);
  await hold(1000);
}
async function editCode(source, filename = "main.py") {
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
  await input.press("ControlOrMeta+A");
  await page.locator(".monaco-editor").evaluate((editor, text) => {
    const target = editor.ownerDocument.activeElement;
    if (!target || !editor.contains(target))
      throw new Error("Editor focus lost.");
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
      const { session } = await state();
      const draft = session.drafts[session.activeId];
      return (
        filename === "main.py" ? draft.source : draft.files?.[filename]
      )?.replaceAll("\r\n", "\n");
    })
    .toBe(source);
  await input.press("Control+Home");
  await hold(1000);
}

try {
  await page.goto(origin);
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(page.locator(".workspace-project-title strong")).toHaveText(
    workspace.name,
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await hold(2000);
  if (resumeAI) {
    expect((await attempt()).question.id).toBe("demo-ai-practice-queue");
    expect((await attempt()).hintsUsed).toHaveLength(resumeFinish ? 1 : 0);
    if (!resumeFinish) {
      await coachSignal("connect-resume");
      await expect
        .poll(() => lastAgentSeenAt, { timeout: 600_000 })
        .toBeTruthy();
      await coachDone();
    }
    await click(tab("Interview"));
  } else if (coaching) await coachSignal("connect", false);
  if (!resumeAI) {
    await chapter(
      "workspace",
      "A local workspace for deliberate practice",
      4500,
    );
    await click(page.getByRole("button", { name: /Switch project:/ }));
    await expect(
      page
        .getByRole("navigation", { name: "Projects", exact: true })
        .getByRole("button"),
    ).toHaveCount(3);
    await chapter("projects", "Three independent preparation projects", 3800);
    await page.keyboard.press("Escape");
    await click(tab("Files"));
    const pairFile = page.getByRole("treeitem", {
      name: "algorithms/pairs.py",
      exact: true,
    });
    await click(pairFile);
    await expect(page.locator(".view-lines")).toContainText("def find_pair");
    await chapter("modules", "Organize Python into importable modules", 4500);
    await click(
      page
        .getByRole("tablist", { name: "Open files" })
        .getByRole("tab", { name: "main.py", exact: true }),
    );
    await click(page.locator(".run-button"));
    await expect(page.locator(".output-status")).toContainText("Completed", {
      timeout: 45_000,
    });
    await expect(page.locator(".console-output")).not.toBeEmpty();
    evidence.pairSumOutput = await page.locator(".console-output").innerText();
    await chapter("python", "Execute real Python locally", 4500);
    await click(button("Run tests"));
    await expect(page.locator(".test-summary")).toContainText(
      "6 passed · 0 failed",
      { timeout: 30_000 },
    );
    evidence.pairSumTests = await page.locator(".test-summary").innerText();
    await chapter("tests", "Check ordinary inputs and edge cases", 4500);
    await click(tab("Scratchpad"));
    await click(tab("Trace table"));
    await click(button("Expand scratchpad"));
    await expect(page.locator(".coding-pane")).not.toBeVisible();
    await chapter("trace", "Trace each step before changing the code", 5000);
    await click(tab("Flowchart"));
    await click(button("Fit flowchart"));
    await expect(page.locator(".flow-node")).toHaveCount(5);
    await chapter("flowchart", "Make the approach visible", 5000);
    await click(tab("Notes"));
    await expect(
      page.getByLabel("Scratchpad notes", { exact: true }),
    ).toHaveValue(/.+/);
    await chapter(
      "notes",
      "Keep assumptions and complexity beside the work",
      3500,
    );
    await click(button("Return to split workspace"));
    // Exercise standard input, tracebacks, and interruption in the same isolated
    // working draft, then restore its genuine Pair sum program before practice.
    const originalSource = (await state()).session.drafts["pair-sum"].source;
    await click(tab("Files"));
    await click(
      page
        .getByRole("tablist", { name: "Open files" })
        .getByRole("tab", { name: "main.py", exact: true }),
    );
    await editCode(
      "from statistics import mean\n\nname = input()\nscores = [int(value) for value in input().split()]\nprint(f'{name}: average = {mean(scores):.1f}')",
    );
    await click(tab("Input"));
    await fill("Standard input", "Python workshop\n8 9 10");
    await chapter(
      "stdin",
      "Supply multiline input and use the Python standard library",
      3500,
    );
    await click(page.locator(".run-button"));
    await expect(page.locator(".console-output")).toHaveText(
      "Python workshop: average = 9.0\n",
      { timeout: 30_000 },
    );
    await chapter("stdlib", "Inspect the real result", 3500);
    await editCode("values = [2, 7, 11]\nprint(values[3])");
    await click(page.locator(".run-button"));
    await expect(page.locator(".console-output")).toContainText(
      "IndexError: list index out of range",
      { timeout: 30_000 },
    );
    await chapter("traceback", "Read the traceback at the failing line", 3800);
    await editCode("values = [2, 7, 11]\nprint(values[-1])");
    await click(page.locator(".run-button"));
    await expect(page.locator(".console-output")).toHaveText("11\n", {
      timeout: 30_000,
    });
    await chapter("fix", "Correct the boundary and run again", 2800);
    await editCode("while True:\n    pass");
    await click(page.locator(".run-button"));
    await expect(button("Stop")).toBeVisible();
    await hold(1200);
    await click(button("Stop"));
    await expect(page.locator(".output-status")).toContainText("Stopped");
    await chapter(
      "stop",
      "Stop an infinite loop without losing the workspace",
      3000,
    );
    await editCode(originalSource);
    await click(tab("Input"));
    await fill("Standard input", "");
    await click(page.locator(".run-button"));
    await expect(page.locator(".output-status")).toContainText("Completed", {
      timeout: 30_000,
    });
    evidence.runtimeRecovery = true;
    await click(button("Practice"));
    await expect(page.getByRole("dialog")).toBeVisible();
    await chapter("practice", "Focused practice on Python fundamentals", 3800);
    const topics = page.locator(".practice-topic-field select");
    evidence.availableTopics = await topics.locator("option").allTextContents();
    const topicValues = await topics
      .locator("option")
      .evaluateAll((options) => options.map((o) => o.value));
    await topics.selectOption(topicValues[Math.min(2, topicValues.length - 1)]);
    await hold(1500);
    await page
      .getByRole("radio", { name: "60-minute mock interview", exact: false })
      .check();
    await chapter(
      "mock-setup",
      "A strict hour, a blank editor, and a complete interview journey",
      5500,
    );
    await click(button("Start 60-minute mock"));
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 30_000 });
    await click(tab("Interview"));
    const initial = await attempt();
    expect(initial.source).toBe("");
    expect(initial.durationMs).toBe(3_600_000);
    await expect(button("Pause timer")).toBeDisabled();
    await expect(button("Reset timer")).toBeDisabled();
    await expect(button("Check baseline")).toHaveCount(0);
    await chapter(
      "blank-mock",
      "Start from scratch; the timer keeps running",
      4200,
    );
    await fill(
      "Clarifying questions & assumptions",
      "IDs are unique strings. Match borrowers exactly. Rejected operations must leave the library unchanged.",
    );
    await chapter("clarify", "Clarify the contract", 3000);
    await click(button("Approach"));
    await fill(
      "Approach & clarifying questions",
      "Each Library owns dictionaries of Item and Loan objects. Validate before mutation; dispatch max_days on each item. Reports return fresh, sorted lists.",
    );
    await chapter("approach", "Explain the design before implementation", 3500);
    await click(button("Code & test"));
    await click(tab("Files"));
    await click(button("New file"));
    await fill("File path", "domain.py");
    await click(button("Create file"));
    await expect(
      page.getByRole("treeitem", { name: "domain.py", exact: true }),
    ).toBeFocused();
    // The fixture's reference is used by this recorded test only. It is pasted
    // into the candidate editor and genuinely executed, never pre-scored.
    await editCode(initial.question.referenceSolution, "domain.py");
    await chapter(
      "mock-module",
      "Build the domain model in its own module",
      4500,
    );
    const files = page.getByRole("tablist", { name: "Open files" });
    await click(files.getByRole("tab", { name: "main.py", exact: true }));
    await editCode(
      "from domain import Item, ShortLoanItem, Loan, Library\n\ndesk = Library()\ndesk.add(Item('camera', 'Camera'))\ndesk.add(ShortLoanItem('tripod', 'Tripod'))\nprint('Available:', desk.available_ids())\nloan = desk.borrow('camera', 'Sam', 10)\nprint('Borrowed:', loan.item.item_id)\nprint('Remaining:', desk.available_ids())",
    );
    await click(page.locator(".run-button"));
    await expect(page.locator(".console-output")).toContainText(
      "Available: ['camera', 'tripod']",
      { timeout: 30_000 },
    );
    await expect(page.locator(".console-output")).toContainText(
      "Remaining: ['tripod']",
    );
    evidence.mockOutput = await page.locator(".console-output").innerText();
    await chapter(
      "mock-run",
      "Execute the design and inspect its behavior",
      4500,
    );
    await click(tab("Interview"));
    await click(button("Follow-up"));
    if (coaching) {
      await page
        .getByRole("checkbox", { name: /Allow live interview updates/ })
        .check();
      await button("Follow-up").scrollIntoViewIfNeeded();
      await chapter(
        "followup-ready",
        "Opt in to live requirements from an external assistant",
        3200,
      );
      await coachSignal("followup");
      await expect(
        page.getByRole("region", { name: "Additional requirements" }),
      ).toContainText("loans_for", { timeout: 600_000 });
      await coachDone();
    } else {
      await chapter(
        "followup-ready",
        "Reveal the scripted follow-up when ready",
        3200,
      );
      await click(button("Reveal follow-up"));
    }
    await expect(
      page.getByRole("region", { name: "Additional requirements" }),
    ).toContainText("loans_for");
    await chapter("followup", "Adapt to an additional requirement", 4500);
    await click(button("Acknowledge requirement"));
    await fill(
      "Follow-up response & tradeoffs",
      "Filter active loans by exact borrower; sort by due day then ID. Return a new list containing the original Loan references. Check isolation and returned items.",
    );
    await click(files.getByRole("tab", { name: "domain.py", exact: true }));
    const extension =
      "\n    def loans_for(self, borrower):\n        return sorted(\n            (loan for loan in self._loans.values() if loan.borrower == borrower),\n            key=lambda loan: (loan.due_day, loan.item.item_id),\n        )\n";
    await editCode(initial.question.referenceSolution + extension, "domain.py");
    await page
      .getByRole("textbox", { name: "Python code editor", exact: true })
      .press("Control+End");
    await chapter("extend", "Extend the implementation", 3500);
    await click(files.getByRole("tab", { name: "main.py", exact: true }));
    await click(page.locator("#tab-tests"));
    await click(button("Add test"));
    await fill("Test name", "Borrower sorting and ownership");
    await fill(
      "Assertion for Borrower sorting and ownership",
      "desk = Library()\nfor key in ('z', 'a', 'm'):\n    desk.add(Item(key, key))\nz = desk.borrow('z', 'Sam', 0)\na = desk.borrow('a', 'Sam', 0)\ndesk.borrow('m', 'Other', 0)\nassert desk.loans_for('Sam') == [a, z]\nassert desk.loans_for('sam') == []\nview = desk.loans_for('Sam')\nview.clear()\nassert desk.loans_for('Sam') == [a, z]\ndesk.return_item('a')\nassert desk.loans_for('Sam') == [z]",
    );
    await click(button("Run tests"));
    await expect(page.locator(".test-summary")).toContainText(
      "1 passed · 0 failed",
      { timeout: 30_000 },
    );
    evidence.followupTests = await page.locator(".test-summary").innerText();
    await chapter(
      "followup-test",
      "Prove the follow-up with a custom test",
      4500,
    );
    await click(button("Wrap up"));
    await click(button("Finish & review"));
    await chapter(
      "submit",
      "Submit the code, notes, and evidence together",
      4200,
    );
    await click(button("Submit interview"));
    await expect(page.locator(".attempt-review")).toBeVisible({
      timeout: 30_000,
    });
    const submitted = await attempt();
    const baseline = submitted.runs.filter((r) => r.kind === "baseline").at(-1);
    expect(baseline.status).toBe("completed");
    expect(baseline.results.length).toBeGreaterThanOrEqual(
      initial.question.baselineTests.length,
    );
    expect(baseline.results.every((r) => r.passed)).toBe(true);
    expect(submitted.requirementUpdates[0].acknowledgedAt).toBeDefined();
    expect(submitted.finishedAt - submitted.startedAt).toBeLessThan(
      10 * 60_000,
    );
    evidence.mock = {
      id: submitted.id,
      title: submitted.question.title,
      actualElapsedSeconds: Math.round(
        (submitted.finishedAt - submitted.startedAt) / 1000,
      ),
      durationSeconds: submitted.durationMs / 1000,
      baselinePassed: baseline.results.length,
      baselineTotal: baseline.results.length,
      customTestsPassed: submitted.runs
        .filter((r) => r.kind === "scratch")
        .at(-1)
        .results.filter((r) => r.passed).length,
      hints: submitted.hintsUsed.length,
      acknowledgedFollowups: submitted.requirementUpdates.length,
      phases: submitted.interviewJourney.transitions.map((t) => t.phase),
    };
    await chapter(
      "review",
      "Review a saved submission against fixed baseline checks",
      4500,
    );
    await page
      .getByRole("heading", { name: "Where the time went", exact: true })
      .scrollIntoViewIfNeeded();
    await chapter("debrief", "See where the actual demo time went", 5000);
    if (coaching) {
      await click(button("Request AI review"));
      await chapter(
        "review-request",
        "Send submitted code and test evidence to your assistant",
        2500,
      );
      await coachSignal("review");
      await expect(page.locator(".feedback-note")).toBeVisible({
        timeout: 600_000,
      });
      await coachDone();
      await page.locator(".feedback-note").scrollIntoViewIfNeeded();
      await chapter(
        "ai-review",
        "Receive feedback grounded in the actual runs",
        6500,
      );
      evidence.externalFeedback = (await attempt()).feedback;
      await page.keyboard.press("Escape");
      await click(button("Practice"));
      await page
        .getByRole("radio", { name: "Topic practice", exact: false })
        .check();
      await page
        .locator(".practice-topic-field select")
        .selectOption("python.oop.instance-state");
      await click(button("Request an AI question"));
      await chapter(
        "question-request",
        "Ask your connected assistant for a targeted question",
        2300,
      );
      await coachSignal("question");
      await expect(button("Validate & add")).toBeVisible({ timeout: 600_000 });
      await coachDone();
      await page.locator(".incoming-question").scrollIntoViewIfNeeded();
      await chapter(
        "ai-question",
        "Review the question, examples, and supplied checks",
        5000,
      );
      await click(button("Validate & add"));
      await expect(button("Start practice")).toBeVisible({ timeout: 30_000 });
      await chapter(
        "validated-question",
        "Validate its reference solution before starting",
        3000,
      );
      await click(button("Start practice"));
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await click(tab("Interview"));
      await fill(
        "Approach & clarifying questions",
        "Each queue should own its own waiting list. I will check two instances and whether changing a returned list affects the queue.",
      );
      await editCode(
        "class PracticeQueue:\n    _waiting = []\n\n    def add(self, name):\n        self._waiting.append(name)\n\n    def next(self):\n        return self._waiting.pop(0) if self._waiting else None\n\n    def waiting(self):\n        return self._waiting\n",
      );
    }
  }
  if (coaching) {
    if (!resumeFinish) {
      await click(button("Check baseline"));
      await expect(page.locator(".output-status")).toContainText("Failed", {
        timeout: 30_000,
      });
      await expect
        .poll(async () =>
          (await attempt()).runs
            .at(-1)
            ?.results?.some((result) => !result.passed),
        )
        .toBe(true);
      evidence.aiFirstTestSummary = await page
        .locator(".console-output")
        .innerText();
      await chapter(
        "ai-first-attempt",
        "A failing check exposes shared mutable state",
        4500,
      );
      await click(button("Ask AI for a hint"));
      await chapter(
        "hint-request",
        "Request a small nudge using the current code and results",
        2300,
      );
      await coachSignal("hint");
      await expect
        .poll(async () => (await attempt()).hintsUsed.length, {
          timeout: 600_000,
        })
        .toBe(1);
      await coachDone();
      if (await page.getByRole("dialog").isVisible())
        await page.keyboard.press("Escape");
      await page.locator(".revealed-hints").scrollIntoViewIfNeeded();
      await chapter(
        "ai-hint",
        "The hint arrives in the working interview",
        5000,
      );
    }
    const question = JSON.parse(
      await readFile(resolve("scripts/demo/coach-question.json"), "utf8"),
    );
    await editCode(question.referenceSolution);
    await click(button("Check baseline"));
    await expect(page.locator(".output-status")).toContainText("Completed", {
      timeout: 30_000,
    });
    await expect
      .poll(async () => {
        const run = (await attempt()).runs.at(-1);
        return (
          run?.results?.length === 5 &&
          run.results.every((result) => result.passed)
        );
      })
      .toBe(true);
    await chapter(
      "ai-fixed",
      "Give each instance its own state; every supplied check passes",
      4500,
    );
    await click(button("Finish & review"));
    await expect(page.locator(".attempt-review")).toBeVisible({
      timeout: 30_000,
    });
    await chapter(
      "ai-record",
      "Save the practice record with the help that was used",
      4500,
    );
    evidence.aiPractice = {
      title: (await attempt()).question.title,
      hints: (await attempt()).hintsUsed,
      passing: (await attempt()).runs
        .at(-1)
        .results.every((result) => result.passed),
    };
  }
  await page.keyboard.press("Escape");
  await click(button("Switch to light mode"));
  await click(button("Review"));
  await page.locator(".review-facts").scrollIntoViewIfNeeded();
  await chapter("light-review", "The same evidence, in light mode", 4200);
  await page.keyboard.press("Escape");
  await click(tab("Brief"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await chapter(
    "light-workspace",
    "Keep practicing. Every project stays local.",
    5000,
  );
  const beforeReload = (await attempt()).id;
  await page.reload();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect((await attempt()).id).toBe(beforeReload);
  await chapter("persistence", "Refresh and resume the saved project", 3500);
  expect(outsideRequests).toEqual([]);
  expect(errors).toEqual([]);
  evidence.completed = true;
} catch (error) {
  evidence.completed = false;
  evidence.failure = String(error.stack ?? error);
  await page
    .screenshot({ path: resolve(output, "failure.png") })
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  evidence.totalSeconds = +((performance.now() - started) / 1000).toFixed(3);
  await writeFile(
    resolve(output, "chapters.json"),
    JSON.stringify(chapters, null, 2),
  );
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(evidence, null, 2),
  );
  await writeFile(
    resolve(output, "waits.json"),
    JSON.stringify(coachWaits, null, 2),
  );
  const video = page.video();
  await context.close();
  if (video)
    await copyFile(await video.path(), resolve(output, "tracepad-raw.webm"));
  await browser.close();
  if (fast) {
    const latest = await (
      await fetch(`${origin}/api/projects/${workspace.id}`)
    ).json();
    const reset = await fetch(`${origin}/api/projects/${workspace.id}/state`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Localpad": "1",
        Origin: origin,
      },
      body: JSON.stringify({
        expectedRevision: latest.revision,
        saveId: crypto.randomUUID(),
        state: initialDocument.state,
      }),
    });
    if (!reset.ok)
      throw new Error("Could not restore the isolated rehearsal fixture.");
  }
  console.log(
    JSON.stringify({
      output,
      completed: evidence.completed,
      seconds: evidence.totalSeconds,
    }),
  );
}
