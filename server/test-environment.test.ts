import { resolve } from "node:path";
import { expect, it } from "vitest";
import { testEnvironment } from "./test-environment";

const runId = "8f631464-60f2-4e46-bf3f-0e1db9bba60c";

it("leaves normal app configuration alone without a test run", () => {
  expect(testEnvironment(process.cwd(), {})).toBeUndefined();
});

it("derives private test storage and fixed ports without trusting data or URL overrides", () => {
  const root = process.cwd();
  const settings = testEnvironment(root, {
    LOCALPAD_E2E_RUN_ID: runId,
    LOCALPAD_DATA_DIR: ".localpad",
    LOCALPAD_URL: "http://127.0.0.1:5173",
  })!;
  expect(settings.origin).toBe("http://127.0.0.1:56173");
  expect(settings.databaseFile).toBe(
    resolve(root, ".localpad/playwright", runId, "projects.sqlite"),
  );
  expect(settings.tokenFile).toBe(
    resolve(root, ".localpad/playwright", runId, "bridge-token"),
  );
  expect(
    testEnvironment(root, {
      LOCALPAD_E2E_RUN_ID: runId,
      LOCALPAD_E2E_MODE: "production",
    })!.origin,
  ).toBe("http://127.0.0.1:54173");
});

it("rejects test directory traversal and unknown server modes", () => {
  expect(() =>
    testEnvironment(process.cwd(), { LOCALPAD_E2E_RUN_ID: "../../" }),
  ).toThrow(/UUID/);
  expect(() =>
    testEnvironment(process.cwd(), {
      LOCALPAD_E2E_RUN_ID: runId,
      LOCALPAD_E2E_MODE: "existing-server",
    }),
  ).toThrow(/development or production/);
});
