import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSession } from "../src/session";
import { defaultLearning } from "../src/learning/state";
import { ProjectDatabase, detailsSchema } from "./projects";
import type { ProjectState } from "../src/projects/types";
import { defaultScratchpad } from "../src/scratchpad/model";

const state = (): ProjectState => ({
  schemaVersion: 1,
  session: defaultSession(),
  learning: defaultLearning(),
});
const databases: ProjectDatabase[] = [];
const db = () => {
  const result = new ProjectDatabase(":memory:");
  databases.push(result);
  return result;
};
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
});
describe("local project persistence", () => {
  it("preserves scratchpads through SQLite reload and backup import, rejecting malformed new saves", () => {
    const database = db(),
      work = state();
    const scratchpad = defaultScratchpad();
    scratchpad.notes = "Model state changes.";
    scratchpad.flow.nodes = [
      { id: "start", type: "start", label: "Start", x: 20, y: 20 },
    ];
    work.session.drafts.sandbox = {
      source: "print('keep')",
      stdin: "",
      tests: [],
      scratchpad,
    };
    const project = database.create({ name: "Interview A" }, work);
    const reloaded = database.get(project.project.id);
    expect(reloaded.state.session.drafts.sandbox.scratchpad).toEqual(
      scratchpad,
    );
    const backup = JSON.parse(JSON.stringify(reloaded));
    const imported = database.create({ name: "Imported backup" }, backup.state);
    expect(imported.state).toEqual(work);
    backup.state.session.drafts.sandbox.scratchpad.trace.rows[0].cells.unknown =
      "invalid";
    expect(() =>
      database.save(project.project.id, {
        expectedRevision: 0,
        saveId: "bad-scratchpad",
        state: backup.state,
      }),
    ).toThrow();
    expect(database.get(project.project.id).state).toEqual(work);
  });

  it("creates independent projects and commits workspace and learning atomically", () => {
    const database = db(),
      first = database.create({ name: "Backend" }),
      second = database.create({ name: "Platform" });
    const work = state();
    work.session.drafts.sandbox = {
      source: "from models import Counter",
      stdin: "one\ntwo",
      tests: [],
      files: { "models.py": "class Counter: pass" },
    };
    work.learning.processedCommandIds = ["delivered"];
    expect(
      database.save(first.project.id, {
        expectedRevision: 0,
        saveId: "one",
        state: work,
      }),
    ).toEqual({ revision: 1 });
    expect(database.get(first.project.id).state).toEqual(work);
    expect(database.get(second.project.id).state).toEqual(second.state);
    expect(() =>
      database.save(first.project.id, {
        expectedRevision: 1,
        saveId: "invalid",
        state: { ...work, learning: {} },
      }),
    ).toThrow();
    expect(database.get(first.project.id).revision).toBe(1);
  });
  it("imports legacy work once without changing the original imported project", () => {
    const database = db(),
      work = state();
    work.session.drafts.sandbox = {
      source: "print('keep me')",
      stdin: "",
      tests: [],
    };
    const imported = database.bootstrap({
      migrationKey: "legacy-content-hash",
      state: work,
    })!;
    const changed = state();
    changed.session.fontSize = 20;
    database.save(imported.project.id, {
      expectedRevision: 0,
      saveId: "edit",
      state: changed,
    });
    expect(
      database.bootstrap({ migrationKey: "legacy-content-hash", state: work })!
        .state,
    ).toEqual(changed);
    expect(database.list()).toHaveLength(1);
  });
  it("makes response-loss retries idempotent and rejects stale concurrent writers", () => {
    const database = db(),
      project = database.create({ name: "Interview" }),
      work = state();
    work.session.fontSize = 18;
    const save = { expectedRevision: 0, saveId: "retry-me", state: work };
    database.save(project.project.id, save);
    expect(database.save(project.project.id, save)).toEqual({ revision: 1 });
    expect(() =>
      database.save(project.project.id, { ...save, state: state() }),
    ).toThrow("different work");
    expect(() =>
      database.save(project.project.id, { ...save, saveId: "other-tab" }),
    ).toThrow("another tab");
    expect(database.get(project.project.id).state).toEqual(work);
  });
  it("archives and restores without deleting code, and rejects writes while archived", () => {
    const database = db(),
      project = database.create({ name: "Finished" });
    database.update(project.project.id, { ...project.project, archived: true });
    expect(database.get(project.project.id).project.archivedAt).not.toBeNull();
    expect(() =>
      database.save(project.project.id, {
        expectedRevision: 0,
        saveId: "archived",
        state: state(),
      }),
    ).toThrow("archived");
    const another = database.bootstrap({})!;
    expect(another.project.id).not.toBe(project.project.id);
    database.update(project.project.id, {
      ...project.project,
      archived: false,
    });
    expect(database.get(project.project.id).state).toEqual(project.state);
    expect(database.get(project.project.id).project.archivedAt).toBeNull();
  });
  it("survives a database restart including migration and save receipts", () => {
    const directory = mkdtempSync(join(tmpdir(), "localpad-projects-")),
      path = join(directory, "projects.sqlite");
    try {
      let database = new ProjectDatabase(path);
      const project = database.bootstrap({
        migrationKey: "old",
        state: state(),
      })!;
      const save = {
        expectedRevision: 0,
        saveId: "receipt",
        state: { ...state(), session: { ...defaultSession(), fontSize: 19 } },
      };
      database.save(project.project.id, save);
      database.close();
      database = new ProjectDatabase(path);
      expect(database.get(project.project.id).state.session.fontSize).toBe(19);
      expect(database.save(project.project.id, save).revision).toBe(1);
      expect(
        database.bootstrap({ migrationKey: "old", state: state() })!.project.id,
      ).toBe(project.project.id);
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("validates names and impossible dates without throwing unexpected errors", () => {
    expect(detailsSchema.safeParse({ name: "  " }).success).toBe(false);
    for (const date of ["2026-99-99", "2026-02-30", "not a date"])
      expect(
        detailsSchema.safeParse({ name: "Test", interviewDate: date }).success,
      ).toBe(false);
    expect(
      detailsSchema.parse({ name: "  Backend  ", interviewDate: "2026-09-23" })
        .name,
    ).toBe("Backend");
  });
});
