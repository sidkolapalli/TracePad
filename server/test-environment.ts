import { resolve } from "node:path";

/** Test servers have fixed, separate ports and a fresh private directory per run. */
export function testEnvironment(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const runId = env.LOCALPAD_E2E_RUN_ID;
  if (!runId) return undefined;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  )
    throw new Error("LOCALPAD_E2E_RUN_ID must be a generated UUID.");
  const mode = env.LOCALPAD_E2E_MODE ?? "development";
  if (mode !== "development" && mode !== "production")
    throw new Error("LOCALPAD_E2E_MODE must be development or production.");
  const port = mode === "production" ? 54173 : 56173;
  const directory = resolve(workspaceRoot, ".localpad", "playwright", runId);
  return {
    runId,
    mode,
    port,
    origin: `http://127.0.0.1:${port}`,
    directory,
    tokenFile: resolve(directory, "bridge-token"),
    databaseFile: resolve(directory, "projects.sqlite"),
  };
}
