import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { z } from "zod";
import { defaultSession, isSession } from "../src/session.ts";
import { defaultLearning, isLearning } from "../src/learning/state.ts";
import type {
  Project,
  ProjectDocument,
  ProjectState,
} from "../src/projects/types.ts";

const MAX_BODY = 32 * 1024 * 1024;
const id = z.string().min(1).max(160);
export const detailsSchema = z.object({
  name: z.string().trim().min(1, "Give this project a name.").max(100),
  company: z.string().trim().max(100).default(""),
  role: z.string().trim().max(160).default(""),
  interviewDate: z
    .string()
    .refine(
      (v) =>
        !v ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          Number.isFinite(new Date(v).getTime()) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Use a valid interview date.",
    )
    .default(""),
  notes: z.string().max(6000).default(""),
});
const stateSchema = z.custom<ProjectState>(
  (v) =>
    typeof v === "object" &&
    v !== null &&
    (v as ProjectState).schemaVersion === 1 &&
    isSession((v as ProjectState).session) &&
    isLearning((v as ProjectState).learning),
  "The project contains unreadable practice data.",
);
const empty = (): ProjectState => ({
  schemaVersion: 1,
  session: defaultSession(),
  learning: defaultLearning(),
});
export class ProjectError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** One transaction commits both workspace and learning data. Revisions prevent lost writes. */
export class ProjectDatabase {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', interview_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER);
      CREATE TABLE IF NOT EXISTS project_documents(project_id TEXT PRIMARY KEY REFERENCES projects(id), revision INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL CHECK(json_valid(state_json)));
      CREATE TABLE IF NOT EXISTS project_saves(project_id TEXT NOT NULL REFERENCES projects(id), save_id TEXT NOT NULL, payload_hash TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(project_id, save_id));
      CREATE TABLE IF NOT EXISTS legacy_imports(fingerprint TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id));
      CREATE INDEX IF NOT EXISTS idx_projects_archived_updated ON projects(archived_at, updated_at DESC);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, unixepoch()*1000);`);
  }
  close() {
    this.db.close();
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private project(row: Record<string, unknown>): Project {
    return {
      id: String(row.id),
      name: String(row.name),
      company: String(row.company),
      role: String(row.role),
      interviewDate: String(row.interview_date),
      notes: String(row.notes),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      archivedAt: row.archived_at === null ? null : Number(row.archived_at),
    };
  }
  list(): Project[] {
    return this.db
      .prepare(
        "SELECT * FROM projects ORDER BY archived_at IS NOT NULL, updated_at DESC, id",
      )
      .all()
      .map((row) => this.project(row));
  }
  get(projectId: string): ProjectDocument {
    const row = this.db
      .prepare(
        "SELECT p.*, d.revision, d.state_json FROM projects p JOIN project_documents d ON d.project_id=p.id WHERE p.id=?",
      )
      .get(projectId);
    if (!row)
      throw new ProjectError(404, "This project is no longer available.");
    return {
      project: this.project(row),
      revision: Number(row.revision),
      state: stateSchema.parse(JSON.parse(String(row.state_json))),
    };
  }
  private insert(input: unknown, state: ProjectState): ProjectDocument {
    const details = detailsSchema.parse(input),
      projectId = randomUUID(),
      now = Date.now();
    stateSchema.parse(state);
    this.db
      .prepare(
        "INSERT INTO projects(id,name,company,role,interview_date,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        projectId,
        details.name,
        details.company,
        details.role,
        details.interviewDate,
        details.notes,
        now,
        now,
      );
    this.db
      .prepare(
        "INSERT INTO project_documents(project_id,state_json) VALUES(?,?)",
      )
      .run(projectId, JSON.stringify(state));
    return this.get(projectId);
  }
  create(input: unknown, state = empty()) {
    return this.transaction(() => this.insert(input, state));
  }
  bootstrap(input: {
    migrationKey?: string;
    state?: ProjectState;
  }): ProjectDocument | null {
    return this.transaction(() => {
      if (input.migrationKey && input.state) {
        const found = this.db
          .prepare("SELECT project_id FROM legacy_imports WHERE fingerprint=?")
          .get(input.migrationKey);
        if (found) return this.get(String(found.project_id));
        const imported = this.insert(
          { name: "Imported practice" },
          input.state,
        );
        this.db
          .prepare(
            "INSERT INTO legacy_imports(fingerprint,project_id) VALUES(?,?)",
          )
          .run(input.migrationKey, imported.project.id);
        return imported;
      }
      const first = this.list().find((p) => p.archivedAt === null);
      return first
        ? this.get(first.id)
        : this.insert({ name: "Interview practice" }, empty());
    });
  }
  update(projectId: string, input: unknown): Project {
    const details = detailsSchema
      .extend({ archived: z.boolean().optional() })
      .parse(input);
    const current = this.get(projectId).project;
    this.db
      .prepare(
        "UPDATE projects SET name=?,company=?,role=?,interview_date=?,notes=?,archived_at=?,updated_at=? WHERE id=?",
      )
      .run(
        details.name,
        details.company,
        details.role,
        details.interviewDate,
        details.notes,
        details.archived === undefined
          ? current.archivedAt
          : details.archived
            ? Date.now()
            : null,
        Date.now(),
        projectId,
      );
    return this.get(projectId).project;
  }
  save(projectId: string, input: unknown): { revision: number } {
    const { expectedRevision, saveId, state } = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        saveId: id,
        state: stateSchema,
      })
      .parse(input);
    const serialized = JSON.stringify(state);
    const hash = createHash("sha256").update(serialized).digest("hex");
    return this.transaction(() => {
      const duplicate = this.db
        .prepare(
          "SELECT payload_hash, revision FROM project_saves WHERE project_id=? AND save_id=?",
        )
        .get(projectId, saveId);
      if (duplicate) {
        if (duplicate.payload_hash !== hash)
          throw new ProjectError(
            409,
            "A save identifier was reused for different work.",
          );
        return { revision: Number(duplicate.revision) };
      }
      const current = this.get(projectId);
      if (current.project.archivedAt !== null)
        throw new ProjectError(
          409,
          "This project was archived. Restore it before saving.",
        );
      if (current.revision !== expectedRevision)
        throw new ProjectError(
          409,
          "This project changed in another tab. Your edits are still here. Save a recovery copy to keep both versions.",
        );
      this.db
        .prepare(
          "UPDATE project_documents SET state_json=?, revision=revision+1 WHERE project_id=? AND revision=?",
        )
        .run(serialized, projectId, expectedRevision);
      this.db
        .prepare("UPDATE projects SET updated_at=? WHERE id=?")
        .run(Date.now(), projectId);
      this.db
        .prepare(
          "INSERT INTO project_saves(project_id,save_id,payload_hash,revision) VALUES(?,?,?,?)",
        )
        .run(projectId, saveId, hash, expectedRevision + 1);
      return { revision: expectedRevision + 1 };
    });
  }
}

async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > MAX_BODY)
      throw new ProjectError(
        413,
        "This project exceeds the 32 MiB save limit. Export your work before removing old attempts.",
      );
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ProjectError(400, "The request is not valid JSON.");
  }
}
export function projectMiddleware(db: ProjectDatabase) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split("?")[0] ?? "";
    if (!path.startsWith("/api/projects")) return next();
    const send = (status: number, value: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(value));
    };
    void (async () => {
      const host = req.headers.host ?? "";
      if (
        !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) ||
        (req.headers.origin && req.headers.origin !== `http://${host}`) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw new ProjectError(
          403,
          "Projects are available only from this local app.",
        );
      if (
        req.method !== "GET" &&
        (req.headers["x-localpad"] !== "1" ||
          !req.headers["content-type"]?.startsWith("application/json"))
      )
        throw new ProjectError(403, "Use the Tracepad app to change projects.");
      if (path === "/api/projects" && req.method === "GET")
        return send(200, { projects: db.list() });
      if (path === "/api/projects" && req.method === "POST") {
        const input = z
          .object({ details: detailsSchema, state: stateSchema.optional() })
          .parse(await body(req));
        return send(201, db.create(input.details, input.state));
      }
      if (path === "/api/projects/bootstrap" && req.method === "POST") {
        const input = z
          .object({
            migrationKey: z.string().max(128).optional(),
            state: stateSchema.optional(),
          })
          .parse(await body(req));
        return send(200, db.bootstrap(input));
      }
      const match =
        /^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/(state|export))?$/.exec(path);
      if (!match) throw new ProjectError(404, "Project endpoint not found.");
      const projectId = match[1];
      if (req.method === "GET") return send(200, db.get(projectId));
      if (req.method === "PATCH" && !match[2])
        return send(200, db.update(projectId, await body(req)));
      if (req.method === "PUT" && match[2] === "state")
        return send(200, db.save(projectId, await body(req)));
      throw new ProjectError(405, "That project action is not supported.");
    })().catch((error) =>
      send(
        error instanceof ProjectError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
        {
          error:
            error instanceof ProjectError
              ? error.message
              : error instanceof z.ZodError
                ? error.issues[0]?.message
                : "The local project database is unavailable. Your editor contents are preserved.",
        },
      ),
    );
  };
}
export function localpadProjects(): Plugin {
  let path = "",
    db: ProjectDatabase | undefined;
  const middleware = () =>
    projectMiddleware((db ??= new ProjectDatabase(path)));
  return {
    name: "localpad-projects",
    configResolved(config) {
      const privateRoot = resolve(config.root, ".localpad");
      const directory = resolve(process.env.LOCALPAD_DATA_DIR ?? privateRoot);
      const rel = relative(privateRoot, directory);
      if (rel.startsWith("..") || isAbsolute(rel))
        throw new Error(
          "LOCALPAD_DATA_DIR must be inside this workspace's .localpad directory, which is excluded from public serving and builds.",
        );
      path = resolve(directory, "projects.sqlite");
    },
    configureServer(server) {
      server.middlewares.use(middleware());
      server.httpServer?.once("close", () => db?.close());
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware());
      server.httpServer.once("close", () => db?.close());
    },
  };
}
