import { test, expect, type Page } from "./fixtures";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { generateQuestion } from "../src/learning/curriculum";
import type { PracticeSnapshot, QuestionPackage } from "../src/learning/types";

async function openConnectedPage(page: Page) {
  const sync = page.waitForResponse((response) =>
    response.url().endsWith("/api/localpad/sync"),
  );
  await page.goto("/");
  const first = await sync;
  expect(first.status()).toBe(200);
  const instanceId = first.request().postDataJSON().snapshot
    .instanceId as string;
  const configuration = await (
    await page.request.get("/api/localpad/connection")
  ).json();
  const config = configuration.config.mcpServers.localpad;
  const client = new Client({
    name: "localpad-browser-integration",
    version: "1.0.0",
  });
  await client.connect(
    new StdioClientTransport({
      ...config,
      env: { ...getDefaultEnvironment(), ...config.env },
      stderr: "pipe",
    }),
  );
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({
      name,
      arguments: {
        instanceId,
        ...([
          "submit_question",
          "provide_hint",
          "submit_requirement",
          "submit_feedback",
        ].includes(name)
          ? { projectId: first.request().postDataJSON().snapshot.project.id }
          : {}),
        ...args,
      },
    });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return result.structuredContent as Record<string, unknown>;
  };
  const snapshot = async () =>
    (await invoke("get_snapshot", {})).snapshot as PracticeSnapshot;
  return { client, invoke, snapshot, instanceId };
}

function aiQuestion(id: string): QuestionPackage {
  return {
    ...generateQuestion("python.oop.instance-state", "foundation", 0),
    id,
    title: `MCP counter ${id}`,
    prompt:
      "Implement Counter(). Its value starts at zero. add(amount) adds a nonnegative integer and returns the new value. Each instance must own its state.",
    starterCode:
      "class Counter:\n    def __init__(self):\n        pass\n\n    def add(self, amount):\n        pass\n",
    examples: [{ input: "c = Counter(); c.add(3)", output: "3" }],
    constraints: ["amount is a nonnegative integer"],
    baselineTests: [
      {
        id: "empty",
        name: "Initial state",
        code: "assert Counter().value == 0",
      },
      {
        id: "add",
        name: "Repeated additions",
        code: "c = Counter()\nassert c.add(3) == 3\nassert c.add(2) == 5\nassert c.value == 5",
      },
      {
        id: "independent",
        name: "Independent instances",
        code: "a, b = Counter(), Counter()\na.add(7)\nassert b.value == 0\nassert b.add(0) == 0",
      },
    ],
    hints: ["Store state on self."],
    referenceSolution:
      "class Counter:\n    def __init__(self):\n        self.value = 0\n\n    def add(self, amount):\n        self.value += amount\n        return self.value\n",
    learningObjectives: ["Give each instance independent mutable state."],
    provenance: { kind: "ai", generator: "MCP browser test" },
  };
}

async function enterSource(page: Page, source: string) {
  await page
    .locator(".monaco-editor .view-lines")
    .click({ position: { x: 30, y: 12 } });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  for (const [index, line] of source.split("\n").entries()) {
    if (index) {
      await page.keyboard.press("Enter");
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+ArrowLeft" : "Home",
      );
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+Shift+ArrowRight" : "Shift+End",
      );
      await page.keyboard.press("Delete");
    }
    if (line) await page.keyboard.insertText(line);
  }
}

test("real MCP delivers a validated question, requested hint, and evidence-based review through the browser", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const bridge = await openConnectedPage(page);
  try {
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page
      .getByRole("button", { name: "Request an AI question", exact: true })
      .click();
    let requestId = "";
    await expect
      .poll(async () => {
        requestId =
          (await bridge.snapshot()).requests.find(
            (request) => request.kind === "question",
          )?.id ?? "";
        return requestId;
      })
      .not.toBe("");
    const question = aiQuestion("browser-flow");
    await bridge.invoke("submit_question", { question, requestId });
    await expect(page.getByText(question.title, { exact: true })).toBeVisible();
    expect((await bridge.snapshot()).activeAttempt).toBeNull();
    await page
      .getByRole("button", { name: "Validate & add", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start practice", exact: true }),
    ).toBeVisible();
    expect((await bridge.snapshot()).activeAttempt).toBeNull();
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: question.title, exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Scratchpad", exact: true }).click();
    await page
      .getByLabel("Scratchpad notes", { exact: true })
      .fill("Each instance needs its own counter.");
    await page.getByRole("tab", { name: "Trace table", exact: true }).click();
    await page
      .getByLabel("Row 1, Variables", { exact: true })
      .fill("a.value = 0; b.value = 0");
    await expect
      .poll(
        async () =>
          (await bridge.snapshot()).scratchpad?.trace.rows[0].cells.variables,
      )
      .toBe("a.value = 0; b.value = 0");
    await page.getByRole("tab", { name: "Interview", exact: true }).click();
    await expect(page.getByText("AI-generated", { exact: true })).toBeVisible();
    await page
      .getByLabel("Approach & clarifying questions")
      .fill(
        "Each object owns value. Test two instances, repeated adds, and zero.",
      );
    await page
      .getByRole("button", { name: "Ask AI for a hint", exact: true })
      .click();
    let hintRequest: PracticeSnapshot["requests"][number] | undefined;
    await expect
      .poll(async () => {
        hintRequest = (await bridge.snapshot()).requests.find(
          (request) => request.kind === "hint",
        );
        return hintRequest?.id ?? "";
      })
      .not.toBe("");
    const hint =
      "Initialize self.value in __init__, then return it after each update.";
    await bridge.invoke("provide_hint", {
      attemptId: hintRequest!.attemptId,
      requestId: hintRequest!.id,
      text: hint,
    });
    await page
      .getByRole("button", { name: "Close interview practice", exact: true })
      .click();
    await expect(
      page.locator(".revealed-hints").getByText(hint, { exact: true }),
    ).toBeVisible();
    await enterSource(page, question.referenceSolution);
    await page
      .getByRole("button", { name: "Finish & review", exact: true })
      .click();
    await expect(
      page.getByText("3 of 3 supplied baseline tests passed.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Request AI review", exact: true })
      .click();
    let completed: PracticeSnapshot | undefined;
    await expect
      .poll(async () => {
        completed = await bridge.snapshot();
        return (
          completed.requests.some((request) => request.kind === "review") &&
          completed.activeAttempt?.finishedAt !== null
        );
      })
      .toBe(true);
    const attempt = completed!.activeAttempt!;
    expect(attempt.scratchpad?.notes).toBe(
      "Each instance needs its own counter.",
    );
    const reviewRequest = completed!.requests.find(
      (request) => request.kind === "review",
    )!;
    expect(attempt.question).not.toHaveProperty("referenceSolution");
    expect(attempt.hintsUsed).toHaveLength(1);
    expect(attempt.runs.at(-1)?.results.every((result) => result.passed)).toBe(
      true,
    );
    const review =
      "All three supplied baseline checks passed; the two-instance case supports independent state.";
    await bridge.invoke("submit_feedback", {
      requestId: reviewRequest.id,
      feedback: {
        id: "browser-review",
        attemptId: attempt.id,
        reviewer: "MCP integration coach",
        createdAt: Date.now(),
        summary: review,
        strengths: ["The final source uses an instance attribute."],
        improvements: ["Explain your zero-amount case aloud."],
        nextPractice: "Add validation while preserving state after errors.",
        evidenceRunIds: [attempt.runs.at(-1)!.id],
      },
    });
    await expect(page.getByText(review, { exact: true })).toBeVisible();
    await expect(
      page.getByText("MCP integration coach", { exact: true }),
    ).toBeVisible();
  } finally {
    await bridge.client.close();
  }
});

test("live mock requirements are opt-in, delivered exactly once, acknowledged and preserved after refresh", async ({
  page,
}) => {
  test.setTimeout(120_000);
  let bridge = await openConnectedPage(page);
  try {
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page
      .getByRole("radio", { name: /60-minute mock interview/i })
      .check();
    await page
      .getByRole("button", { name: "Start 60-minute mock", exact: true })
      .click();
    await expect
      .poll(async () => (await bridge.snapshot()).activeAttempt?.mode)
      .toBe("mock");
    await page.getByRole("tab", { name: "Interview", exact: true }).click();
    const enabled = page.getByRole("checkbox", {
      name: /Allow live interview updates/,
    });
    await expect(enabled).not.toBeChecked();
    await page
      .getByLabel("Clarifying questions & assumptions", { exact: true })
      .fill("Confirm whether renewals retain the original borrower.");
    await page.getByRole("button", { name: "Approach", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await bridge.snapshot()
          ).activeAttempt?.interviewJourney?.transitions.at(-1)?.phase,
      )
      .toBe("approach");
    expect(
      (await bridge.snapshot()).activeAttempt?.interviewJourney?.clarifications,
    ).toContain("original borrower");
    const before = (await bridge.snapshot()).activeAttempt!;
    const update = {
      id: "live-requirement-1",
      title: "Support renewals",
      description:
        "Add a renew operation that rejects an item without an active loan. Explain how you will test that boundary.",
      author: "MCP interview coach",
      createdAt: Date.now(),
    };
    const disabledResult = await bridge.client.callTool({
      name: "submit_requirement",
      arguments: {
        instanceId: bridge.instanceId,
        projectId: (await bridge.snapshot()).project!.id,
        attemptId: before.id,
        update,
      },
    });
    expect(disabledResult.isError).toBe(true);
    expect(JSON.stringify(disabledResult.content)).toContain("not enabled");
    await enabled.check();
    await expect
      .poll(
        async () => (await bridge.snapshot()).activeAttempt?.liveInterviewer,
      )
      .toBe(true);
    await enterSource(page, 'print("my code stays unchanged")\n');
    await expect
      .poll(async () =>
        (await bridge.snapshot()).source.replaceAll("\r\n", "\n"),
      )
      .toBe('print("my code stays unchanged")\n');
    const sourceBeforeUpdate = (await bridge.snapshot()).source;
    const first = await bridge.invoke("submit_requirement", {
      attemptId: before.id,
      update,
    });
    const retry = await bridge.invoke("submit_requirement", {
      attemptId: before.id,
      update,
    });
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    await expect(page.locator(".interview-notice")).toContainText(update.title);
    const interview = page.getByRole("tabpanel", {
      name: "Interview",
      exact: true,
    });
    await expect(interview.locator(".requirement-list article")).toHaveCount(1);
    await expect(interview.locator(".requirement-list")).toContainText(
      update.description,
    );
    await page.screenshot({
      path: "artifacts/interview-updates-desktop.png",
      fullPage: true,
    });
    await interview
      .getByRole("button", { name: "Acknowledge requirement", exact: true })
      .click();
    await expect(page.locator(".interview-notice")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await bridge.snapshot()).activeAttempt?.requirementUpdates?.[0]
            ?.acknowledgedAt,
      )
      .toBeTruthy();
    const applied = (await bridge.snapshot()).activeAttempt!;
    expect(applied.source).toBe(sourceBeforeUpdate);
    expect(applied.question).toEqual(before.question);
    expect(applied.requirementUpdates).toHaveLength(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Interview", exact: true }).click();
    await page.screenshot({
      path: "artifacts/interview-updates-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await bridge.client.close();
    bridge = await openConnectedPage(page);
    await page.getByRole("tab", { name: "Interview", exact: true }).click();
    await expect(
      page
        .getByRole("tabpanel", { name: "Interview", exact: true })
        .locator(".requirement-list article"),
    ).toHaveCount(1);
    const restored = (await bridge.snapshot()).activeAttempt!;
    expect(restored.requirementUpdates).toEqual(applied.requirementUpdates);
    expect(restored.source).toBe(applied.source);
    expect(restored.liveInterviewer).toBe(true);
    expect(
      await bridge.invoke("submit_requirement", {
        attemptId: restored.id,
        update,
      }),
    ).toMatchObject({ duplicate: true, state: "delivered" });
    await page
      .getByRole("checkbox", { name: /Allow live interview updates/ })
      .uncheck();
    await expect
      .poll(
        async () => (await bridge.snapshot()).activeAttempt?.liveInterviewer,
      )
      .toBe(false);
    const rejected = await bridge.client.callTool({
      name: "submit_requirement",
      arguments: {
        instanceId: bridge.instanceId,
        projectId: (await bridge.snapshot()).project!.id,
        attemptId: restored.id,
        update: { ...update, id: "disabled-again" },
      },
    });
    expect(rejected.isError).toBe(true);
  } finally {
    await bridge.client.close();
  }
});

test("rejects a generated question with a broken reference and never serves the local bridge token", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const bridge = await openConnectedPage(page);
  try {
    for (const path of [
      "/.localpad/bridge-token",
      "/%2elocalpad%2fbridge-token",
    ]) {
      const response = await page.request.get(path);
      expect(response.status()).toBe(403);
    }
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await page
      .getByRole("button", { name: "Request an AI question", exact: true })
      .click();
    const question = {
      ...aiQuestion("broken-reference"),
      referenceSolution: 'raise RuntimeError("This reference is broken")',
    };
    await bridge.invoke("submit_question", { question });
    await expect(page.getByText(question.title, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Validate & add", exact: true })
      .click();
    await expect(page.locator(".preparation-error")).toContainText(
      /reference|validation|baseline/i,
    );
    expect((await bridge.snapshot()).activeAttempt).toBeNull();
    await expect(
      page.getByRole("button", { name: "Start practice", exact: true }),
    ).toHaveCount(0);
  } finally {
    await bridge.client.close();
  }
});
