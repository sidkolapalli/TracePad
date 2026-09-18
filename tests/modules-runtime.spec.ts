import { test, expect, type Page } from "@playwright/test";
import type { RunRequest, RunnerEvent } from "../src/types";

async function runProjects(page: Page, projects: Omit<RunRequest, "runId">[]) {
  return page.evaluate(async (inputs) => {
    const modulePath = "/src/runner.ts";
    const { PythonRunner } = await import(modulePath);
    const runner = new PythonRunner();
    const results: RunnerEvent[][] = [];
    try {
      for (let i = 0; i < inputs.length; i++) {
        results.push(
          await new Promise<RunnerEvent[]>((resolve) => {
            const events: RunnerEvent[] = [];
            runner.run(
              { ...inputs[i], runId: `project-${i}` },
              (event: RunnerEvent) => {
                events.push(event);
                if (event.type === "complete") resolve(events);
              },
            );
          }),
        );
      }
    } finally {
      runner.destroy();
    }
    return results;
  }, projects);
}

function output(events: RunnerEvent[], stream = "stdout") {
  return events
    .filter(
      (event): event is Extract<RunnerEvent, { type: "output" }> =>
        event.type === "output" && event.stream === stream,
    )
    .map((event) => event.text)
    .join("");
}
function completion(events: RunnerEvent[]) {
  return events.findLast(
    (event): event is Extract<RunnerEvent, { type: "complete" }> =>
      event.type === "complete",
  );
}
function results(events: RunnerEvent[]) {
  return events
    .filter(
      (event): event is Extract<RunnerEvent, { type: "test" }> =>
        event.type === "test",
    )
    .map((event) => event.result);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("executes main.py with sibling, nested, relative, and namespace package imports", async ({
  page,
}) => {
  const [events] = await runProjects(page, [
    {
      source:
        "from helpers import double\nfrom package import answer\nfrom namespace.tools import suffix\nprint(double(answer), suffix)",
      stdin: "",
      files: {
        "helpers.py": "def double(value):\n    return value * 2\n",
        "package/__init__.py": "from .values import answer\n",
        "package/values.py":
          "from .nested.seed import seed\nanswer = seed + 1\n",
        "package/nested/__init__.py": "",
        "package/nested/seed.py": "seed = 20\n",
        "namespace/tools.py": 'suffix = "works"\n',
      },
    },
  ]);
  expect(completion(events)?.status).toBe("completed");
  expect(output(events)).toBe("42 works\n");
});

test("resets module state, import tables, stdin, and project files after each case including a failure", async ({
  page,
}) => {
  const [events] = await runProjects(page, [
    {
      source:
        'import helpers, os, sys\nfrom package import value\nhelpers.items.append("main")\nentry = input("value>")',
      stdin: "same input\n",
      files: {
        "helpers.py": "items = []\n",
        "package/__init__.py": "value = 42\n",
      },
      tests: [
        {
          id: "mutate",
          name: "Mutate state and fail",
          code: 'assert helpers.items == ["main"]\nhelpers.items.append("leaked")\nopen("helpers.py", "w").write("items = [999]")\nos.remove("package/__init__.py")\nopen("junk.py", "w").write("leaked = True")\nsys.modules["leaked_alias"] = helpers\ndel sys.modules["helpers"]\nsys.path.clear()\nos.chdir("/tmp")\nassert False, "intentional first failure"',
        },
        {
          id: "fresh",
          name: "Restore submitted project",
          code: 'assert helpers.items == ["main"]\nassert value == 42\nassert entry == "same input"\nassert "leaked_alias" not in sys.modules\nassert not os.path.exists("junk.py")\nassert open("helpers.py").read() == "items = []\\n"\nassert os.getcwd() == "/localpad_project"',
        },
        {
          id: "again",
          name: "Still independent",
          code: 'assert helpers.items == ["main"]\nassert entry == "same input"',
        },
      ],
    },
  ]);
  expect(results(events).map((result) => result.passed)).toEqual([
    false,
    true,
    true,
  ]);
  expect(results(events)[0].error).toContain("intentional first failure");
  expect(output(events)).toBe("value>value>value>");
});

test("captures module filenames, missing imports, module input prompts, and import of canonical main", async ({
  page,
}) => {
  const [broken, missing, input, main] = await runProjects(page, [
    {
      source: "from package import broken",
      stdin: "",
      files: {
        "package/__init__.py": "",
        "package/broken.py": 'raise ValueError("module failure")',
      },
    },
    { source: "import absent_module", stdin: "", files: {} },
    {
      source: "import reader\nprint(reader.value)",
      stdin: "hello\n",
      files: { "reader.py": 'value = input("module>")' },
    },
    {
      source: "answer = 42\nimport reader\nprint(reader.value)",
      stdin: "",
      files: { "reader.py": "from main import answer\nvalue = answer" },
    },
  ]);
  expect(completion(broken)?.status).toBe("failed");
  expect(output(broken, "stderr")).toContain("package/broken.py");
  expect(output(broken, "stderr")).toContain("ValueError: module failure");
  expect(output(missing, "stderr")).toContain("ModuleNotFoundError");
  expect(completion(input)?.status).toBe("completed");
  expect(output(input)).toBe("module>hello\n");
  expect(completion(main)?.status).toBe("completed");
  expect(output(main)).toBe("42\n");
});

test("rejects traversal, canonical-main overrides, ambiguous imports, excessive count and UTF-8 size", async ({
  page,
}) => {
  const all = await runProjects(page, [
    {
      source: 'print("must not run")',
      stdin: "",
      files: { "../escape.py": "" },
    },
    {
      source: 'print("must not run")',
      stdin: "",
      files: { "main.py": "print(123)" },
    },
    {
      source: 'print("must not run")',
      stdin: "",
      files: { "pkg.py": "", "pkg/helper.py": "" },
    },
    {
      source: 'print("must not run")',
      stdin: "",
      files: Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [`file${index}.py`, ""]),
      ),
    },
    {
      source: 'print("must not run")',
      stdin: "",
      files: { "large.py": "☃".repeat(350_000) },
    },
  ]);
  for (const events of all) {
    expect(completion(events)?.status).toBe("failed");
    expect(output(events)).toBe("");
    expect(
      events.some(
        (event) => event.type === "status" && event.status === "running",
      ),
    ).toBe(false);
  }
  expect(completion(all[0])?.message).toContain("parent paths");
  expect(completion(all[1])?.message).toContain("entrypoint");
  expect(completion(all[2])?.message).toContain("module and package");
  expect(completion(all[3])?.message).toContain("32");
  expect(completion(all[4])?.message).toContain("1 MiB");
});

test("fresh runs discard old modules and keep single-file practice compatible", async ({
  page,
}) => {
  const [first, second, single] = await runProjects(page, [
    {
      source: "import helper\nprint(helper.value)",
      stdin: "",
      files: { "helper.py": "value = 1" },
    },
    {
      source: "import helper\nprint(helper.value)",
      stdin: "",
      files: { "helper.py": "value = 2" },
    },
    {
      source:
        'from math import factorial\nprint(factorial(5))\nimport os\nassert os.listdir(".") == ["main.py"]',
      stdin: "",
    },
  ]);
  expect(output(first)).toBe("1\n");
  expect(output(second)).toBe("2\n");
  expect(output(single)).toBe("120\n");
  expect(
    [first, second, single].map((events) => completion(events)?.status),
  ).toEqual(["completed", "completed", "completed"]);
});
