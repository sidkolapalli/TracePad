import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { generateQuestion, topics } from "./curriculum";
import type { Level, QuestionPackage } from "./types";

const levels: Level[] = ["foundation", "applied"];
const samples = topics.flatMap((topic) =>
  levels.flatMap((level) =>
    [0, 1, 8, 9].map((seed) => generateQuestion(topic.id, level, seed)),
  ),
);
const mocks = [0, 9].map((seed) =>
  generateQuestion(topics[0].id, "applied", seed, "mock"),
);

describe("learning curriculum", () => {
  it("exposes stable topic IDs for connected tools", () => {
    expect(topics.map((topic) => topic.id)).toEqual([
      "python.oop.instance-state",
      "python.oop.validation",
      "python.oop.composition",
      "python.oop.polymorphism",
      "python.fundamentals.collections",
      "python.debugging.edge-cases",
    ]);
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
  });

  it("is deterministic and reports honest local generation provenance", () => {
    for (const question of samples) {
      expect(
        generateQuestion(
          question.topicId,
          question.level,
          question.provenance.seed!,
        ),
      ).toEqual(question);
      expect(question.provenance).toMatchObject({
        kind: "local-template",
        generator: "Tracepad",
      });
      expect(question.provenance.templateId).toBeTruthy();
      expect(question.schemaVersion).toBe(1);
    }
  });

  it("varies the actual contract within every topic and increases applied scope", () => {
    for (const topic of topics) {
      const one = generateQuestion(topic.id, "foundation", 0);
      const two = generateQuestion(topic.id, "foundation", 1);
      const changedData = generateQuestion(topic.id, "foundation", 8);
      const applied = generateQuestion(topic.id, "applied", 0);
      expect(one.provenance.templateId).not.toBe(two.provenance.templateId);
      expect(one.referenceSolution).not.toBe(two.referenceSolution);
      expect(one.baselineTests).not.toEqual(two.baselineTests);
      expect(one.examples).not.toEqual(changedData.examples);
      expect(applied.referenceSolution).not.toBe(one.referenceSolution);
      expect(applied.baselineTests.length).toBeGreaterThan(
        one.baselineTests.length,
      );
      expect(applied.learningObjectives.length).toBeGreaterThan(
        one.learningObjectives.length,
      );
      expect(one.recommendedMinutes).toBe(15);
      expect(applied.recommendedMinutes).toBe(20);
    }
  });

  it("provides complete, bounded packages with separate named baseline assertions", () => {
    const ids = new Set<string>();
    for (const question of [...samples, ...mocks]) {
      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id);
      expect(question.title.length).toBeLessThan(160);
      expect(question.prompt.length).toBeGreaterThan(250);
      expect(question.prompt.length).toBeLessThan(30_000);
      expect(question.starterCode).toBeTruthy();
      expect(question.examples.length).toBeGreaterThan(0);
      expect(question.constraints.length).toBeGreaterThanOrEqual(3);
      expect(question.hints).toHaveLength(3);
      expect(new Set(question.hints).size).toBe(3);
      expect(question.baselineTests.length).toBeGreaterThanOrEqual(5);
      expect(question.baselineTests.length).toBeLessThanOrEqual(6);
      expect(new Set(question.baselineTests.map((test) => test.id)).size).toBe(
        question.baselineTests.length,
      );
      for (const test of question.baselineTests) {
        expect(test.name).toBeTruthy();
        expect(test.code).toMatch(/assert|AssertionError/);
      }
    }
  });

  it("creates an integrated 60-minute mock with a blank editor and explicit public contracts", () => {
    const question = mocks[0];
    expect(question.recommendedMinutes).toBe(60);
    expect(question.topicId).toBe("python.oop.composition");
    expect(question.starterCode.trim().split("\n")).toHaveLength(1);
    expect(question.starterCode.startsWith("#")).toBe(true);
    for (const contract of [
      "Item(item_id, name)",
      "Loan(item, borrower, due_day)",
      "Library()",
      "borrow(item_id, borrower, day)",
      "return_item(item_id)",
      "available_ids()",
      "overdue(day)",
    ]) {
      expect(question.prompt).toContain(contract);
    }
    expect(question.baselineTests).toHaveLength(6);
  });

  it("does not share mutable generated packages", () => {
    const first = generateQuestion(topics[0].id, "foundation", 0);
    first.baselineTests[0].code = "assert False";
    first.hints.push("changed");
    first.examples[0].input = "changed";
    const next = generateQuestion(topics[0].id, "foundation", 0);
    expect(next.baselineTests[0].code).not.toBe("assert False");
    expect(next.hints).toHaveLength(3);
    expect(next.examples[0].input).not.toBe("changed");
  });

  it("rejects invalid generation requests and normalizes safe integer seeds", () => {
    expect(() => generateQuestion("unknown", "foundation", 0)).toThrow(
      "Unknown learning topic",
    );
    expect(() => generateQuestion("__proto__", "foundation", 0)).toThrow(
      "Unknown learning topic",
    );
    expect(() => generateQuestion(topics[0].id, "foundation", NaN)).toThrow(
      "safe integer",
    );
    expect(() => generateQuestion(topics[0].id, "foundation", 1.5)).toThrow(
      "safe integer",
    );
    expect(
      generateQuestion(topics[0].id, "foundation", -1).provenance.seed,
    ).toBe(4_294_967_295);
  });

  it("executes all generated reference solutions and rejects broken solutions using local Pyodide", () => {
    const checks = [...samples, ...mocks].flatMap((question) => [
      {
        id: `${question.id}:reference`,
        source: question.referenceSolution,
        tests: question.baselineTests,
        expected: "pass",
      },
      {
        id: `${question.id}:starter`,
        source: question.starterCode,
        tests: question.baselineTests,
        expected: "fail",
      },
    ]);
    const mutationPairs: Record<string, [string, string]> = {
      "oop.playlist.v1": ["return list(self._tracks)", "return self._tracks"],
      "oop.basket.v1": [
        "return sum(self._counts.values())",
        "return len(self._counts)",
      ],
      "oop.account.v1": ["if amount <= 0:", "if amount < 0:"],
      "oop.reservation.v1": ["self.booked += seats", "self.booked = seats"],
      "oop.project.v1": [
        "self._tasks.append(task)",
        "self._tasks.append(Task(task.title))",
      ],
      "oop.cart.v1": [
        "self._lines.append((product, quantity))",
        "self._lines.append((Product(product.name, product.price), quantity))",
      ],
      "oop.pricing.v1": [
        "return [policy.price(value) for value in subtotals]",
        "return [value for value in subtotals]",
      ],
      "oop.notifier.v1": [
        "return [formatter.format(message) for message in messages]",
        "return list(messages)",
      ],
      "collections.inventory.v1": [
        "totals[item] = totals.get(item, 0) + delta",
        "totals[item] = delta",
      ],
      "collections.attendance.v1": [
        "if person not in seen[session]:",
        "if True:",
      ],
      "debug.chunks.v1": [
        "range(0, len(items), size)",
        "range(0, len(items) - size, size)",
      ],
      "debug.streaks.v1": [
        "current = 0\n    return",
        "current = 1\n    return",
      ],
      "mock.equipment-library.v1": [
        "return day > self.due_day",
        "return day >= self.due_day",
      ],
    };
    const appliedMutations: Record<string, [string, string]> = {
      "oop.playlist.v1": [
        "self._tracks.insert(0, self._last)",
        "self._tracks.append(self._last)",
      ],
      "oop.basket.v1": [
        "if self.quantity(item) < quantity:",
        "if self.quantity(item) <= quantity:",
      ],
      "oop.account.v1": [
        "if other is self or amount <= 0 or amount > self.balance:",
        "if amount <= 0 or amount > self.balance:",
      ],
      "oop.reservation.v1": [
        "if seats <= 0 or seats > self.booked:",
        "if seats <= 0 or seats > self.capacity:",
      ],
      "oop.project.v1": [
        "if stored is task:",
        "if stored.title == task.title:",
      ],
      "oop.cart.v1": [
        "if stored is not product]",
        "if stored.name != product.name]",
      ],
      "oop.pricing.v1": [
        "if subtotal >= self.threshold",
        "if subtotal > self.threshold",
      ],
      "oop.notifier.v1": [
        "self._formatters = list(formatters)",
        "self._formatters = formatters",
      ],
      "collections.inventory.v1": [
        "if total < minimum]",
        "if total <= minimum]",
      ],
      "collections.attendance.v1": [
        "if len(values) >= minimum_sessions)",
        "if len(values) > minimum_sessions)",
      ],
      "debug.chunks.v1": ["if fill is not None and", "if fill and"],
      "debug.streaks.v1": ["if current > best:", "if current >= best:"],
    };
    const mutate = (
      question: QuestionPackage,
      pair: [string, string],
      label: string,
    ) => {
      expect(
        question.referenceSolution,
        `${question.id}: missing mutation target`,
      ).toContain(pair[0]);
      checks.push({
        id: `${question.id}:${label}`,
        source: question.referenceSolution.replace(pair[0], pair[1]),
        tests: question.baselineTests,
        expected: "fail",
      });
    };
    for (const question of [
      ...samples.filter((q) => q.provenance.seed! < 2),
      mocks[0],
    ]) {
      const template = question.provenance.templateId!;
      mutate(question, mutationPairs[template], "mutant");
      if (question.level === "applied" && appliedMutations[template])
        mutate(question, appliedMutations[template], "applied-mutant");
    }

    // Run the installed, pinned WASM Python runtime in Node; no network or system Python required.
    // Every assertion receives a fresh namespace, matching the application's runner contract.
    const script = `
      import { readFileSync } from 'node:fs';
      import { createRequire } from 'node:module';
      import { dirname } from 'node:path';
      import { loadPyodide } from 'pyodide';
      const require = createRequire(import.meta.url);
      const data = readFileSync(0, 'utf8');
      const python = await loadPyodide({ indexURL: dirname(require.resolve('pyodide/package.json')), packages: [], stdout: () => {}, stderr: () => {} });
      python.globals.set('_checks_json', data);
      const output = python.runPython(\`
import json, traceback
_checks = json.loads(_checks_json)
_reports = []
for check in _checks:
    failures = []
    for case in check["tests"]:
        namespace = {"__name__": "__main__"}
        try:
            exec(compile(check["source"], "main.py", "exec"), namespace)
            exec(compile(case["code"], "test.py", "exec"), namespace)
        except BaseException:
            failures.append({"test": case["name"], "error": traceback.format_exc()})
    _reports.append({"id": check["id"], "expected": check["expected"], "failures": failures})
json.dumps(_reports)
      \`);
      process.stdout.write(output);
    `;
    const processResult = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        input: JSON.stringify(checks),
        encoding: "utf8",
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    expect(processResult.error, processResult.stderr).toBeUndefined();
    expect(processResult.status, processResult.stderr).toBe(0);
    const reports = JSON.parse(processResult.stdout) as {
      id: string;
      expected: string;
      failures: { test: string; error: string }[];
    }[];
    expect(reports).toHaveLength(checks.length);
    for (const report of reports) {
      if (report.expected === "pass")
        expect(report.failures, report.id).toEqual([]);
      else
        expect(
          report.failures.length,
          `${report.id} incorrectly passed all baselines`,
        ).toBeGreaterThan(0);
    }
  }, 100_000);
});
