import { test, expect, type Page } from "@playwright/test";
import { builtInExercises } from "../src/exercises";
import type { PracticeCase, RunnerEvent } from "../src/types";
import { incorrectSolutions, referenceSolutions } from "./solutions";

interface Execution {
  source: string;
  stdin?: string;
  tests?: PracticeCase[];
  stopAfterRunningMs?: number;
}

/** Import the real Vite worker entry; no app hooks, mocks, or Python substitutes. */
async function execute(
  page: Page,
  requests: Execution[],
): Promise<RunnerEvent[][]> {
  return page.evaluate(async (inputs) => {
    const moduleUrl = "/src/runner.ts";
    const { PythonRunner } = await import(moduleUrl);
    const runner = new PythonRunner();
    const results: RunnerEvent[][] = [];
    try {
      for (let index = 0; index < inputs.length; index++) {
        const input = inputs[index];
        const events = await new Promise<RunnerEvent[]>((resolve) => {
          const collected: RunnerEvent[] = [];
          let stopTimer: ReturnType<typeof setTimeout> | undefined;
          runner.run(
            {
              runId: `test-${index}`,
              source: input.source,
              stdin: input.stdin ?? "",
              tests: input.tests,
            },
            (event: RunnerEvent) => {
              collected.push(event);
              if (
                event.type === "status" &&
                event.status === "running" &&
                input.stopAfterRunningMs !== undefined
              ) {
                stopTimer = setTimeout(
                  () => runner.stop(),
                  input.stopAfterRunningMs,
                );
              }
              if (event.type === "complete") {
                clearTimeout(stopTimer);
                resolve(collected);
              }
            },
          );
        });
        results.push(events);
      }
    } finally {
      runner.destroy();
    }
    return results;
  }, requests);
}

const output = (
  events: RunnerEvent[],
  stream: "stdout" | "stderr" = "stdout",
) =>
  events
    .filter(
      (event): event is Extract<RunnerEvent, { type: "output" }> =>
        event.type === "output" && event.stream === stream,
    )
    .map((event) => event.text)
    .join("");
const completion = (events: RunnerEvent[]) =>
  events.findLast(
    (event): event is Extract<RunnerEvent, { type: "complete" }> =>
      event.type === "complete",
  );
const cases = (events: RunnerEvent[]) =>
  events
    .filter(
      (event): event is Extract<RunnerEvent, { type: "test" }> =>
        event.type === "test",
    )
    .map((event) => event.result);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("captures Unicode stdout, stderr, and output without a final newline", async ({
  page,
}) => {
  const [events] = await execute(page, [
    {
      source:
        'import sys\nprint("Hello, 世界 👋")\nsys.stdout.write("tail")\nsys.stderr.write("warning: café")',
    },
  ]);
  expect(completion(events)?.status).toBe("completed");
  expect(output(events)).toBe("Hello, 世界 👋\ntail");
  expect(output(events, "stderr")).toBe("warning: café");
  expect(
    events
      .filter((event) => event.type === "status")
      .map((event) => event.status),
  ).toEqual(["loading", "running"]);
});

test("supports standard-library imports and multiline input with inline prompts", async ({
  page,
}) => {
  const [library, input] = await execute(page, [
    {
      source:
        'from collections import Counter\nfrom math import factorial\nimport json, statistics\nprint(json.dumps({"factorial": factorial(5), "counts": Counter("aba"), "median": statistics.median([1, 9, 4])}, sort_keys=True))',
    },
    {
      source:
        'name = input("name>")\nage = input("age>")\nprint(f"{name}:{age}")',
      stdin: "Ada\n42\n",
    },
  ]);
  expect(completion(library)?.status).toBe("completed");
  expect(JSON.parse(output(library))).toEqual({
    factorial: 120,
    counts: { a: 2, b: 1 },
    median: 4,
  });
  expect(completion(input)?.status).toBe("completed");
  expect(output(input)).toBe("name>age>Ada:42\n");
});

test("reports syntax errors, runtime exceptions, and exhausted input with tracebacks", async ({
  page,
}) => {
  const results = await execute(page, [
    { source: "def broken(:\n    pass" },
    { source: 'raise ValueError("expected boom")' },
    { source: "print(input())\ninput()", stdin: "only one line\n" },
  ]);
  for (const events of results)
    expect(completion(events)?.status).toBe("failed");
  expect(output(results[0], "stderr")).toContain("SyntaxError");
  expect(output(results[0], "stderr")).toContain("main.py");
  expect(output(results[1], "stderr")).toContain("ValueError: expected boom");
  expect(output(results[1], "stderr")).toContain("Traceback");
  expect(output(results[2])).toBe("only one line\n");
  expect(output(results[2], "stderr")).toContain("EOFError");
});

test("isolates test globals and stdin, and continues after an assertion failure", async ({
  page,
}) => {
  const [events] = await execute(page, [
    {
      source:
        'counter = globals().get("counter", 0) + 1\nitems = []\nvalue = input()',
      stdin: "fresh input\n",
      tests: [
        {
          id: "mutates",
          name: "Mutates namespace",
          code: 'items.append(1)\nassert counter == 1\nassert value == "fresh input"',
        },
        {
          id: "fresh",
          name: "Gets a fresh namespace",
          code: 'assert items == []\nassert counter == 1\nassert value == "fresh input"',
        },
        {
          id: "fails",
          name: "Ordinary failure",
          code: 'assert False, "expected failure"',
        },
        {
          id: "after",
          name: "Runs after failure",
          code: "assert items == []\nassert counter == 1",
        },
      ],
    },
  ]);
  expect(cases(events).map((result) => result.passed)).toEqual([
    true,
    true,
    false,
    true,
  ]);
  expect(cases(events)[2].error).toContain("AssertionError: expected failure");
  expect(cases(events)[2].error).toContain("test.py");
  expect(completion(events)?.status).toBe("failed");
});

test("starts every run with a fresh interpreter", async ({ page }) => {
  const [first, second] = await execute(page, [
    {
      source:
        'import builtins\nbuiltins.previous_run = "leaked"\nglobal_value = 42\nprint("first")',
    },
    {
      source:
        'import builtins\nassert not hasattr(builtins, "previous_run")\nassert "global_value" not in globals()\nprint("clean")',
    },
  ]);
  expect(completion(first)?.status).toBe("completed");
  expect(completion(second)?.status).toBe("completed");
  expect(output(second)).toBe("clean\n");
});

test("sys.exit cannot bypass assertions or prevent subsequent test cases", async ({
  page,
}) => {
  const [earlyExit, testExit] = await execute(page, [
    {
      source: "import sys\nsys.exit(0)",
      tests: [
        {
          id: "must-run",
          name: "Cannot skip this assertion",
          code: 'assert False, "must execute"',
        },
      ],
    },
    {
      source: "answer = 42",
      tests: [
        {
          id: "exit",
          name: "Exit in an assertion",
          code: "import sys\nsys.exit(0)",
        },
        {
          id: "after-exit",
          name: "Runs after exit",
          code: "assert answer == 42",
        },
      ],
    },
  ]);
  expect(completion(earlyExit)?.status).toBe("failed");
  expect(cases(earlyExit)[0].passed).toBe(false);
  expect(cases(earlyExit)[0].error).toContain("SystemExit");
  expect(cases(testExit).map((result) => result.passed)).toEqual([false, true]);
});

test("bounds a Unicode output flood at 100 KB and allows another run", async ({
  page,
}) => {
  const [flood, recovery] = await execute(page, [
    { source: 'while True:\n    print("☃" * 8192)' },
    { source: 'print("recovered")' },
  ]);
  expect(completion(flood)?.status).toBe("output-limit");
  const bytes = Buffer.byteLength(
    output(flood) + output(flood, "stderr"),
    "utf8",
  );
  expect(bytes).toBeLessThanOrEqual(100 * 1024);
  expect(bytes).toBeGreaterThan(100_000);
  expect(output(flood)).not.toContain("\uFFFD");
  expect(completion(recovery)?.status).toBe("completed");
  expect(output(recovery)).toBe("recovered\n");
});

test("stops an infinite loop promptly and can run again", async ({ page }) => {
  const [stopped, recovery] = await execute(page, [
    { source: "while True:\n    pass", stopAfterRunningMs: 100 },
    { source: "print(6 * 7)" },
  ]);
  expect(completion(stopped)?.status).toBe("stopped");
  expect(completion(stopped)!.elapsedMs).toBeLessThan(3_000);
  expect(completion(recovery)?.status).toBe("completed");
  expect(output(recovery)).toBe("42\n");
});

test("times out a nonprinting infinite loop after 10 seconds and recovers", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const [timedOut, recovery] = await execute(page, [
    { source: "while True:\n    pass" },
    { source: 'print("after timeout")' },
  ]);
  expect(completion(timedOut)?.status).toBe("timed-out");
  expect(completion(timedOut)!.elapsedMs).toBeGreaterThanOrEqual(9_900);
  expect(completion(timedOut)!.elapsedMs).toBeLessThan(20_000);
  expect(completion(recovery)?.status).toBe("completed");
  expect(output(recovery)).toBe("after timeout\n");
});

test("reports initialization failure and retries successfully", async ({
  page,
}) => {
  await page.route("**/python/pyodide.mjs", (route) => route.abort("failed"));
  const [failed] = await execute(page, [{ source: 'print("must not run")' }]);
  expect(completion(failed)?.status).toBe("failed");
  expect(output(failed)).not.toContain("must not run");
  await page.unroute("**/python/pyodide.mjs");
  const [recovery] = await execute(page, [{ source: 'print("ready again")' }]);
  expect(completion(recovery)?.status).toBe("completed");
  expect(output(recovery)).toBe("ready again\n");
});

test("all exercise suites accept reference solutions and reject representative mistakes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const exercise of builtInExercises) {
    await test.step(exercise.title, async () => {
      const [correct, incorrect] = await execute(page, [
        { source: referenceSolutions[exercise.id], tests: exercise.tests },
        { source: incorrectSolutions[exercise.id], tests: exercise.tests },
      ]);
      expect(cases(correct), `${exercise.id}: reference results`).toHaveLength(
        exercise.tests.length,
      );
      expect(
        cases(correct).every((result) => result.passed),
        `${exercise.id}: ${JSON.stringify(cases(correct))}`,
      ).toBe(true);
      expect(completion(correct)?.status).toBe("completed");
      expect(
        cases(incorrect).some((result) => !result.passed),
        `${exercise.id}: incorrect solution must be rejected`,
      ).toBe(true);
      expect(completion(incorrect)?.status).toBe("failed");
    });
  }
});
