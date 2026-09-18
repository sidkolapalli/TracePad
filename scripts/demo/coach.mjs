import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { testEnvironment } from "../../server/test-environment.ts";

/**
 * External coach for the isolated demo app; does not automate the browser.
 *
 * PowerShell:
 *   $env:LOCALPAD_E2E_RUN_ID = '<isolated production server UUID>'
 *   node scripts/demo/coach.mjs list_instances
 *   node scripts/demo/coach.mjs get_snapshot .localpad/demo/snapshot-args.json
 *
 * Every other command takes one JSON argument file. Write commands must include
 * instanceId and projectId from the current snapshot. A queued result is not a
 * delivery acknowledgement: inspect a later snapshot to confirm browser receipt.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));
const origin = "http://127.0.0.1:54173";
const reads = new Set(["list_instances", "get_snapshot", "get_attempt"]);
const writes = new Set([
  "submit_question",
  "provide_hint",
  "submit_requirement",
  "submit_feedback",
]);
const commands = new Set([...reads, ...writes]);
const omittedKeys = new Set([
  "config",
  "mcpServers",
  "token",
  "bridgeToken",
  "tokenFile",
  "authorization",
  "apiKey",
  "referenceSolution",
]);

function sanitized(value) {
  if (Array.isArray(value)) return value.map(sanitized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !omittedKeys.has(key))
        .map(([key, item]) => [key, sanitized(item)]),
    );
  }
  return typeof value === "string"
    ? value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    : value;
}

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Origin: origin },
  });
  demand(response.ok, `Isolated server request failed (${response.status}).`);
  return response.json();
}

async function run() {
  const [command, argsFile, ...extra] = process.argv.slice(2);
  demand(
    commands.has(command) && extra.length === 0,
    `Usage: node scripts/demo/coach.mjs <${[...commands].join("|")}> [args.json]`,
  );
  demand(
    command === "list_instances" || argsFile,
    "This command requires a JSON argument file.",
  );
  const args = argsFile
    ? JSON.parse(await readFile(resolve(argsFile), "utf8"))
    : {};
  demand(
    args && typeof args === "object" && !Array.isArray(args),
    "The argument file must contain a JSON object.",
  );
  const settings = testEnvironment(root, {
    LOCALPAD_E2E_RUN_ID: process.env.LOCALPAD_E2E_RUN_ID,
    LOCALPAD_E2E_MODE: "production",
  });
  demand(settings, "Supply the isolated server's LOCALPAD_E2E_RUN_ID.");
  demand(
    settings.origin === origin,
    "The demo must use the isolated production port.",
  );
  demand(
    settings.databaseFile !== resolve(root, ".localpad/projects.sqlite"),
    "Refusing normal application data.",
  );
  async function verifyIdentity() {
    const actual = await getJson("/__localpad_e2e__/identity");
    for (const [key, expected] of Object.entries(settings)) {
      demand(
        actual[key] === expected,
        `Refusing a server with mismatched ${key}.`,
      );
    }
  }

  await verifyIdentity();
  const connection = await getJson("/api/localpad/connection");
  const config = connection?.config?.mcpServers?.localpad;
  const expectedArgs = [
    "--import",
    pathToFileURL(resolve(root, "node_modules/tsx/dist/loader.mjs")).href,
    resolve(root, "server/mcp.ts"),
  ];
  demand(
    config &&
      resolve(config.command) === resolve(process.execPath) &&
      JSON.stringify(config.args) === JSON.stringify(expectedArgs),
    "The isolated server returned an unexpected MCP launch command.",
  );
  const expectedEnv = {
    LOCALPAD_URL: origin,
    LOCALPAD_E2E_RUN_ID: settings.runId,
    LOCALPAD_E2E_MODE: "production",
  };
  demand(
    config.env &&
      Object.keys(config.env).length === Object.keys(expectedEnv).length &&
      Object.entries(expectedEnv).every(
        ([key, value]) => config.env[key] === value,
      ),
    "The isolated server returned an unexpected MCP environment.",
  );

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: root,
    stderr: "pipe",
  });
  // Child diagnostics are deliberately not echoed: connection details are private.
  transport.stderr?.on("data", () => {});
  const client = new Client({ name: "tracepad-demo-coach", version: "1.0.0" });
  const invoke = (name, toolArgs) =>
    client.callTool({ name, arguments: toolArgs }, undefined, {
      timeout: 15_000,
    });
  try {
    await client.connect(transport);
    if (writes.has(command)) {
      demand(
        typeof args.instanceId === "string" &&
          typeof args.projectId === "string",
        "A mutation requires instanceId and projectId from the current snapshot.",
      );
      const current = await invoke("get_snapshot", {
        instanceId: args.instanceId,
      });
      demand(!current.isError, "Cannot verify the current browser snapshot.");
      demand(
        current.structuredContent?.snapshot?.project?.id === args.projectId,
        "The mutation projectId does not match the active browser project.",
      );
      demand(
        current.structuredContent?.freshness?.status === "fresh",
        "The browser snapshot is stale; wait for the app to reconnect.",
      );
      await verifyIdentity();
    }
    const result = await invoke(command, args);
    demand(result.structuredContent, "MCP returned no structured content.");
    process.stdout.write(
      `${JSON.stringify(sanitized(result.structuredContent), null, 2)}\n`,
    );
    if (result.isError) process.exitCode = 1;
  } finally {
    // SDK close terminates its own child if that child does not exit promptly.
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

run().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ error: sanitized(error instanceof Error ? error.message : "Coach command failed.") })}\n`,
  );
  process.exitCode = 1;
});
