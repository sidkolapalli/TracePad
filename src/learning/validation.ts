import { PythonRunner } from "../runner";
import type { QuestionPackage } from "./types";

/** Reference code is checked in the same disposable browser interpreter as practice. */
export function validateQuestion(
  question: QuestionPackage,
  runner: PythonRunner,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!question.baselineTests.length || !question.referenceSolution.trim()) {
      reject(
        new Error("A reference solution and baseline tests are required."),
      );
      return;
    }
    if (
      new Set(question.baselineTests.map((test) => test.id)).size !==
      question.baselineTests.length
    ) {
      reject(new Error("Baseline test IDs must be unique."));
      return;
    }
    let passed = 0;
    runner.run(
      {
        runId: crypto.randomUUID(),
        source: question.referenceSolution,
        stdin: "",
        tests: question.baselineTests,
      },
      (event) => {
        if (event.type === "test" && event.result.passed) passed++;
        if (event.type === "complete") {
          if (
            event.status === "completed" &&
            passed === question.baselineTests.length
          )
            resolve();
          else
            reject(
              new Error(
                event.status === "stopped"
                  ? "Preparation canceled."
                  : `Question validation failed: ${passed}/${question.baselineTests.length} baseline tests passed. ${event.message ?? "The question needs correction."}`,
              ),
            );
        }
      },
    );
  });
}
