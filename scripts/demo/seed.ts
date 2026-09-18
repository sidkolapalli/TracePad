import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { testEnvironment } from "../../server/test-environment.ts";
import type { Project, ProjectDocument } from "../../src/projects/types.ts";
import { demoState, seedMetadata } from "./fixture.ts";

/**
 * Run against a fresh, already running isolated production server:
 * LOCALPAD_E2E_RUN_ID=<server UUID> node --import tsx scripts/demo/seed.ts
 * Never starts a server, opens a database, deletes, or updates existing data.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));
const origin = "http://127.0.0.1:54173";
const settings = testEnvironment(root, {
  LOCALPAD_E2E_RUN_ID: process.env.LOCALPAD_E2E_RUN_ID,
  LOCALPAD_E2E_MODE: "production",
});
if (!settings)
  throw new Error("Supply the isolated server's LOCALPAD_E2E_RUN_ID.");
assert.equal(settings.origin, origin);
assert.notEqual(
  settings.databaseFile,
  resolve(root, ".localpad/projects.sqlite"),
);

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      "X-Localpad": "1",
      Origin: origin,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(`Demo request failed: ${path} (${response.status}).`);
  return (await response.json()) as T;
}

async function verifyIdentity() {
  const actual = await request<Record<string, unknown>>(
    "/__localpad_e2e__/identity",
  );
  for (const [key, expected] of Object.entries(settings!)) {
    assert.equal(
      actual[key],
      expected,
      `Refusing a server with mismatched ${key}.`,
    );
  }
}

const state = demoState();
await verifyIdentity();
const { projects } = await request<{ projects: Project[] }>("/api/projects");
assert.ok(Array.isArray(projects), "The server did not return a project list.");
assert.equal(
  projects.length,
  0,
  "Refusing to seed a database that already contains projects.",
);

const created: ProjectDocument[] = [];
const definitions = [
  { name: "Algorithms lab", role: "Patterns and problem solving" },
  { name: "Python fundamentals", role: "Build fluency through practice" },
  {
    name: "Wednesday · Python interview",
    role: "Python software engineer",
    state,
  },
];
for (const definition of definitions) {
  // Confirm isolation again immediately before every mutation.
  await verifyIdentity();
  const document = await request<ProjectDocument>("/api/projects", {
    details: {
      name: definition.name,
      company: "",
      role: definition.role,
      interviewDate: "",
      notes: `${seedMetadata.label}\nFixture: ${seedMetadata.version}\nAuthored example content for the local product walkthrough.`,
    },
    ...(definition.state ? { state: definition.state } : {}),
  });
  assert.equal(document.project.name, definition.name);
  created.push(document);
  // Separate updated_at values, making the last project the bootstrap choice.
  if (created.length < definitions.length) {
    await new Promise((done) => setTimeout(done, 20));
  }
}

const active = created[2];
const saved = await request<ProjectDocument>(
  `/api/projects/${active.project.id}`,
);
assert.deepEqual(
  saved.state,
  state,
  "Persisted demo content must match the fixture.",
);
const listed = await request<{ projects: Project[] }>("/api/projects");
assert.equal(listed.projects.length, 3);
assert.equal(
  listed.projects[0].id,
  active.project.id,
  "Demo project must be selected by bootstrap.",
);
process.stdout.write(
  `${JSON.stringify({
    wednesday: active.project.id,
    fundamentals: created[1].project.id,
    algorithms: created[0].project.id,
  })}\n`,
);
