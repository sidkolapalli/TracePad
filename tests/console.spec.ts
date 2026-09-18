import { test, expect, readProjectState, expectPythonStatus } from "./fixtures";
import { defaultSession, STORAGE_KEY } from "../src/session";
import {
  createAttempt,
  defaultLearning,
  LEARNING_KEY,
} from "../src/learning/state";
import { generateQuestion } from "../src/learning/curriculum";

test("console preserves raw streams and saved evidence when copied or cleared", async ({
  page,
}) => {
  const source =
    'import sys\nprint("trace: start")\nprint("  item  count")\nprint("  A     2")\nprint("note: inspect the next case", file=sys.stderr)\nprint("tail", end="")';
  const attempt = createAttempt(
    generateQuestion("python.oop.instance-state", "foundation", 0),
    "drill",
    15,
  );
  attempt.source = source;
  const learning = {
    ...defaultLearning(),
    activeAttemptId: attempt.id,
    attempts: [attempt],
  };
  const session = defaultSession();
  session.activeId = `attempt-${attempt.id}`;
  session.drafts[session.activeId] = {
    source,
    stdin: "",
    tests: [{ id: "own", name: "My console check", code: "assert True" }],
  };
  await page.addInitScript(
    ({ session, learning, sessionKey, learningKey }) => {
      localStorage.setItem(sessionKey, JSON.stringify(session));
      localStorage.setItem(learningKey, JSON.stringify(learning));
      // Exercise copy handlers without replacing the user's system clipboard.
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (
              window as typeof window & { copiedConsole: string }
            ).copiedConsole = value;
          },
        },
      });
    },
    { session, learning, sessionKey: STORAGE_KEY, learningKey: LEARNING_KEY },
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Clear output", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Run tests", exact: true }).click();
  await expectPythonStatus(page, "Completed");
  await expect(page.locator(".test-summary")).toContainText("1 passed");
  await expect
    .poll(
      async () =>
        (await readProjectState(page)).learning.attempts[0].runs.length,
    )
    .toBe(1);
  const evidence = (await readProjectState(page)).learning.attempts[0].runs[0];
  await page.getByRole("tab", { name: "Console", exact: true }).click();
  const output = page.locator(".console-output");
  const raw = await output.textContent();
  expect(raw).toContain("  item  count\n  A     2\n");
  expect(raw).toContain("note: inspect the next case\n");
  expect(raw).toMatch(/tail$/);
  await expect(output.locator(".stderr")).toContainText(
    "note: inspect the next case",
  );
  await page.getByRole("button", { name: "Copy output", exact: true }).click();
  await expect(page.getByText("Copied output.", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { copiedConsole: string }).copiedConsole,
    ),
  ).toBe(raw);
  await page.screenshot({
    path: "artifacts/console-desktop-dark.png",
    animations: "disabled",
  });
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("clipboard unavailable");
    };
  });
  await page.getByRole("button", { name: "Copy output", exact: true }).click();
  await expect(
    page.getByText("Copy failed. Select the output and copy it manually.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear output", exact: true }).click();
  await expect(output).toHaveText("");
  await expect(
    page.getByText("Output cleared.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".output-status")).toContainText("Completed");
  await page.locator("#tab-tests").click();
  await expect(page.locator(".test-summary")).toContainText("1 passed");
  await page.getByRole("tab", { name: "Console", exact: true }).click();
  await expect(output).toHaveText("");
  expect((await readProjectState(page)).learning.attempts[0].runs[0]).toEqual(
    evidence,
  );
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expectPythonStatus(page, "Completed");
  await expect(output).toContainText("trace: start");
  await expect(page.locator(".output-status")).toContainText("Completed");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({
    path: "artifacts/console-desktop-light.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("tab", { name: "Code", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Clear output", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/console-mobile-light.png",
    animations: "disabled",
  });
});
