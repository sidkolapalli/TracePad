import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { testEnvironment } from "./test-environment.ts";
import type { BridgeCommand } from "../src/learning/types.ts";
import {
  agentOperationSchema,
  jsonSchemas,
  syncSchema,
  type AgentOperation,
  type Snapshot,
} from "./contracts.ts";

const MAX_BODY_BYTES = 1_048_576;
const STALE_MS = 30_000;
const EXPIRY_MS = 60 * 60_000;
const MAX_INSTANCES = 32;
export const tokenPath = fileURLToPath(
  new URL("../.localpad/bridge-token", import.meta.url),
);

export async function ensureBridgeToken(path = tokenPath): Promise<string> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const token = randomBytes(32).toString("hex");
  try {
    await writeFile(path, token, { flag: "wx", mode: 0o600 });
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      return (await readFile(path, "utf8")).trim();
    throw error;
  }
}

class BridgeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
interface Instance {
  connectionId?: string;
  snapshot: Snapshot;
  receivedAt: number;
  lastAgentSeenAt: number | null;
  pending: BridgeCommand[];
  seen: Map<string, { id: string; payload: string }>;
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new BridgeError(415, "Use application/json.");
  if (Number(req.headers["content-length"]) > MAX_BODY_BYTES)
    throw new BridgeError(413, "Request exceeds the 1 MB limit.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES)
      throw new BridgeError(413, "Request exceeds the 1 MB limit.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeError(400, "Invalid JSON.");
  }
}
function authenticated(req: IncomingMessage, token: string) {
  if (!req.headers.authorization?.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(
    req.headers.authorization?.replace(/^Bearer /, "") ?? "",
  );
  const expected = Buffer.from(token);
  return (
    token.length >= 32 &&
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}
function validateAddress(req: IncomingMessage, allowedPorts: number[]) {
  const host = req.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host))
    throw new BridgeError(403, "Only loopback hosts are allowed.");
  const url = new URL(`http://${host}`);
  if (!allowedPorts.includes(Number(url.port)))
    throw new BridgeError(403, "This port is not enabled for the bridge.");
  if (req.headers.origin && req.headers.origin !== url.origin)
    throw new BridgeError(403, "Foreign origins are not allowed.");
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new BridgeError(403, "Cross-site requests are not allowed.");
}

export function createBridgeMiddleware({
  token,
  allowedPorts = [5173, 4173],
  now = Date.now,
  workspaceRoot = fileURLToPath(new URL("..", import.meta.url)),
}: {
  token: string;
  allowedPorts?: number[];
  now?: () => number;
  workspaceRoot?: string;
}) {
  const instances = new Map<string, Instance>();
  const detached = new Set<string>();
  function cleanup() {
    for (const [id, instance] of instances)
      if (now() - instance.receivedAt > EXPIRY_MS) instances.delete(id);
  }
  function freshness(instance: Instance) {
    const ageMs = Math.max(0, now() - instance.receivedAt);
    return {
      status: ageMs > STALE_MS ? "stale" : "fresh",
      ageMs,
      receivedAt: instance.receivedAt,
    };
  }
  function findInstance(id: string, writing = false) {
    const instance = instances.get(id);
    if (!instance)
      throw new BridgeError(
        404,
        "Instance not found. Open Tracepad in your browser first.",
      );
    if (writing && freshness(instance).status === "stale")
      throw new BridgeError(
        409,
        "Instance is stale. Bring Tracepad back to an active browser tab.",
      );
    instance.lastAgentSeenAt = now();
    return instance;
  }
  function attempt(instance: Instance, id: string) {
    const found = [
      instance.snapshot.activeAttempt,
      ...(instance.snapshot.recentAttempts ?? []),
    ].find((item) => item?.id === id);
    if (!found)
      throw new BridgeError(
        404,
        "Attempt evidence is not in the current snapshot. Open its review in Tracepad or select a recent attempt.",
      );
    return found;
  }
  function enqueue(
    instance: Instance,
    key: string,
    payload:
      | Omit<Extract<BridgeCommand, { type: "question" }>, "id">
      | Omit<Extract<BridgeCommand, { type: "requirement" }>, "id">
      | Omit<Extract<BridgeCommand, { type: "hint" }>, "id">
      | Omit<Extract<BridgeCommand, { type: "feedback" }>, "id">,
  ) {
    const serialized = JSON.stringify(payload);
    const previous = instance.seen.get(key);
    if (previous) {
      if (previous.payload !== serialized)
        throw new BridgeError(
          409,
          "This question, requirement, request, or feedback ID has already been used with different content.",
        );
      return {
        schemaVersion: 1,
        commandId: previous.id,
        duplicate: true,
        state: instance.pending.some((item) => item.id === previous.id)
          ? "queued"
          : "delivered",
      };
    }
    if (instance.pending.length >= 30)
      throw new BridgeError(
        429,
        "Command queue is full. Wait for the browser to sync.",
      );
    const command = {
      id: randomUUID(),
      ...payload,
      projectId: instance.snapshot.project?.id,
    } as BridgeCommand;
    instance.pending.push(command);
    instance.seen.set(key, { id: command.id, payload: serialized });
    if (instance.seen.size > 1_000)
      instance.seen.delete(instance.seen.keys().next().value!);
    return {
      schemaVersion: 1,
      commandId: command.id,
      duplicate: false,
      state: "queued",
    };
  }
  function operate(operation: AgentOperation) {
    if (operation.operation === "list_instances")
      return {
        schemaVersion: 1,
        instances: [...instances].map(([id, instance]) => {
          instance.lastAgentSeenAt = now();
          return {
            instanceId: id,
            project: instance.snapshot.project,
            title: instance.snapshot.activeExercise.title,
            activeAttemptId: instance.snapshot.activeAttempt?.id ?? null,
            requests: instance.snapshot.requests,
            freshness: freshness(instance),
          };
        }),
      };
    const writing = !["get_snapshot", "get_attempt"].includes(
      operation.operation,
    );
    const instance = findInstance(operation.instanceId, writing);
    if (
      writing &&
      instance.snapshot.project &&
      (!("projectId" in operation) ||
        operation.projectId !== instance.snapshot.project.id)
    )
      throw new BridgeError(
        409,
        "Project changed or projectId is missing. Read get_snapshot and use its project.id before sending an update.",
      );
    if (operation.operation === "get_snapshot")
      return {
        schemaVersion: 1,
        freshness: freshness(instance),
        snapshot: instance.snapshot,
      };
    if (operation.operation === "get_attempt")
      return {
        schemaVersion: 1,
        freshness: freshness(instance),
        attempt: attempt(instance, operation.attemptId),
      };
    if (operation.operation === "submit_requirement") {
      const target = instance.snapshot.activeAttempt;
      if (
        !target ||
        target.id !== operation.attemptId ||
        target.finishedAt !== null ||
        target.mode !== "mock"
      )
        throw new BridgeError(
          409,
          "Requirement updates are only available for the current unfinished mock interview.",
        );
      if (!target.liveInterviewer)
        throw new BridgeError(
          409,
          "The learner has not enabled live interviewer updates for this attempt.",
        );
      const key = `requirement:${target.id}:${operation.update.id}`;
      const existing = target.requirementUpdates?.find(
        (update) => update.id === operation.update.id,
      );
      if (existing) {
        const { acknowledgedAt: _acknowledged, ...original } = existing;
        if (JSON.stringify(original) !== JSON.stringify(operation.update))
          throw new BridgeError(
            409,
            "This requirement ID already belongs to a different immutable update.",
          );
        return {
          schemaVersion: 1,
          duplicate: true,
          state: "delivered",
          requirementId: existing.id,
        };
      }
      if (
        (target.requirementUpdates?.length ?? 0) +
          instance.pending.filter(
            (command) =>
              command.type === "requirement" && command.attemptId === target.id,
          ).length >=
          50 &&
        !instance.seen.has(key)
      )
        throw new BridgeError(
          429,
          "This attempt has reached its limit of 50 requirement updates.",
        );
      return enqueue(instance, key, {
        type: "requirement",
        attemptId: target.id,
        update: operation.update,
      });
    }
    if (operation.operation === "submit_question") {
      if (operation.question.provenance.kind !== "ai")
        throw new BridgeError(
          400,
          "Externally generated questions must use ai provenance.",
        );
      const ids = operation.question.baselineTests.map((test) => test.id);
      if (new Set(ids).size !== ids.length)
        throw new BridgeError(400, "Baseline test IDs must be unique.");
      if (
        operation.requestId &&
        !instance.snapshot.requests.some(
          (request) =>
            request.kind === "question" && request.id === operation.requestId,
        )
      ) {
        // A retry after delivery is still idempotent; enqueue validates its original payload.
        if (!instance.seen.has(`question:${operation.question.id}`))
          throw new BridgeError(409, "Question request is no longer pending.");
      }
      return enqueue(instance, `question:${operation.question.id}`, {
        type: "question",
        question: operation.question,
        ...(operation.requestId ? { requestId: operation.requestId } : {}),
      });
    }
    if (operation.operation === "provide_hint") {
      const key = `hint:${operation.requestId}`;
      if (
        !instance.seen.has(key) &&
        (!instance.snapshot.requests.some(
          (request) =>
            request.kind === "hint" &&
            request.id === operation.requestId &&
            request.attemptId === operation.attemptId,
        ) ||
          instance.snapshot.activeAttempt?.id !== operation.attemptId ||
          instance.snapshot.activeAttempt.finishedAt !== null)
      )
        throw new BridgeError(
          409,
          "Hints require the current unfinished attempt and its outstanding hint request.",
        );
      return enqueue(instance, key, {
        type: "hint",
        attemptId: operation.attemptId,
        text: operation.text,
        requestId: operation.requestId,
      });
    }
    const target = attempt(instance, operation.feedback.attemptId);
    if (target.finishedAt === null)
      throw new BridgeError(
        409,
        "Feedback can only be submitted for a finished attempt.",
      );
    if (
      operation.feedback.evidenceRunIds.some(
        (id) => !target.runs.some((run) => run.id === id),
      )
    )
      throw new BridgeError(
        400,
        "Feedback cites run IDs that are not in this attempt.",
      );
    if (
      operation.requestId &&
      !instance.snapshot.requests.some(
        (request) =>
          request.kind === "review" &&
          request.id === operation.requestId &&
          request.attemptId === target.id,
      ) &&
      !instance.seen.has(`feedback:${operation.feedback.id}`)
    )
      throw new BridgeError(409, "Review request is no longer pending.");
    return enqueue(instance, `feedback:${operation.feedback.id}`, {
      type: "feedback",
      feedback: operation.feedback,
      ...(operation.requestId ? { requestId: operation.requestId } : {}),
    });
  }
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    // Vite serves workspace files in development. Never let its static or /@fs
    // handlers expose the local credential directory, including raw imports.
    let decodedPath = req.url?.split("?")[0] ?? "";
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      /* malformed paths are handled by Vite */
    }
    if (/(?:^|[/\\])\.localpad(?:[/\\]|$)/i.test(decodedPath)) {
      send(res, 403, {
        error: "Local bridge credentials are not browser resources.",
      });
      return;
    }
    const route = req.url?.split("?")[0];
    if (!route?.startsWith("/api/localpad/")) {
      next();
      return;
    }
    void (async () => {
      validateAddress(req, allowedPorts);
      cleanup();
      if (route === "/api/localpad/schema" && req.method === "GET") {
        send(res, 200, jsonSchemas);
        return;
      }
      if (route === "/api/localpad/connection" && req.method === "GET") {
        send(res, 200, {
          schemaVersion: 1,
          config: {
            mcpServers: {
              localpad: {
                command: process.execPath,
                args: [
                  "--import",
                  pathToFileURL(
                    resolve(workspaceRoot, "node_modules/tsx/dist/loader.mjs"),
                  ).href,
                  resolve(workspaceRoot, "server/mcp.ts"),
                ],
                env: {
                  LOCALPAD_URL: `http://${req.headers.host}`,
                  ...(testEnvironment(workspaceRoot)
                    ? {
                        LOCALPAD_E2E_RUN_ID: process.env.LOCALPAD_E2E_RUN_ID,
                        LOCALPAD_E2E_MODE:
                          process.env.LOCALPAD_E2E_MODE ?? "development",
                      }
                    : {}),
                },
              },
            },
          },
        });
        return;
      }
      if (req.method !== "POST")
        throw new BridgeError(405, "Use POST for this endpoint.");
      if (route === "/api/localpad/detach") {
        if (req.headers["x-localpad"] !== "1")
          throw new BridgeError(403, "Missing Tracepad browser header.");
        const input = (await body(req)) as {
          instanceId?: unknown;
          connectionId?: unknown;
        };
        if (
          !input ||
          typeof input.instanceId !== "string" ||
          typeof input.connectionId !== "string" ||
          input.connectionId.length > 160
        )
          throw new BridgeError(400, "Invalid browser connection.");
        detached.add(input.connectionId);
        if (detached.size > 256)
          detached.delete(detached.values().next().value!);
        if (
          instances.get(input.instanceId)?.connectionId === input.connectionId
        )
          instances.delete(input.instanceId);
        send(res, 200, { detached: true });
        return;
      }
      if (route === "/api/localpad/sync") {
        if (req.headers["x-localpad"] !== "1")
          throw new BridgeError(403, "Missing Tracepad browser header.");
        const parsed = syncSchema.safeParse(await body(req));
        if (!parsed.success) {
          send(res, 400, {
            error: "Invalid browser snapshot.",
            issues: parsed.error.issues,
          });
          return;
        }
        const { snapshot, ackIds, connectionId } = parsed.data;
        if (connectionId && detached.has(connectionId))
          throw new BridgeError(409, "This browser connection has closed.");
        let instance = instances.get(snapshot.instanceId);
        if (instance && instance.snapshot.project?.id !== snapshot.project?.id)
          throw new BridgeError(
            409,
            "An instance cannot move to a different project.",
          );
        if (!instance) {
          if (instances.size >= MAX_INSTANCES)
            throw new BridgeError(
              429,
              "Too many browser instances. Close unused tabs and restart the local server.",
            );
          instance = {
            snapshot,
            receivedAt: now(),
            lastAgentSeenAt: null,
            pending: [],
            seen: new Map(),
          };
          instances.set(snapshot.instanceId, instance);
        }
        instance.snapshot = snapshot;
        instance.connectionId = connectionId;
        instance.receivedAt = now();
        instance.pending = instance.pending.filter(
          (command) => !ackIds.includes(command.id),
        );
        send(res, 200, {
          schemaVersion: 1,
          commands: instance.pending,
          lastAgentSeenAt: instance.lastAgentSeenAt,
        });
        return;
      }
      if (route === "/api/localpad/agent") {
        if (!authenticated(req, token))
          throw new BridgeError(
            401,
            "A valid local bridge bearer token is required.",
          );
        const parsed = agentOperationSchema.safeParse(await body(req));
        if (!parsed.success) {
          send(res, 400, {
            error: "Invalid operation.",
            issues: parsed.error.issues,
          });
          return;
        }
        send(res, 200, operate(parsed.data));
        return;
      }
      throw new BridgeError(404, "Bridge endpoint not found.");
    })().catch((error) =>
      send(res, error instanceof BridgeError ? error.status : 500, {
        error:
          error instanceof BridgeError
            ? error.message
            : "The local bridge could not complete this request.",
      }),
    );
  };
}

export function localpadBridge(): Plugin {
  let middleware: ReturnType<typeof createBridgeMiddleware> | undefined;
  let configuredTokenPath = tokenPath;
  let workspaceRoot = dirname(dirname(tokenPath));
  let allowedPorts = [5173, 4173];
  async function initialize() {
    middleware ??= createBridgeMiddleware({
      token: await ensureBridgeToken(configuredTokenPath),
      workspaceRoot,
      allowedPorts,
    });
    return middleware;
  }
  return {
    name: "localpad-learning-bridge",
    config(config) {
      return {
        server: {
          fs: {
            deny: [
              ".env",
              ".env.*",
              "*.{crt,pem,key,p12,pfx,cer,der}",
              ".npmrc",
              ".yarnrc.yml",
              "**/.git/**",
              ...(config.server?.fs?.deny ?? []),
              "**/.localpad/**",
            ],
          },
        },
      };
    },
    configResolved(config) {
      workspaceRoot = config.root;
      const test = testEnvironment(config.root);
      configuredTokenPath =
        test?.tokenFile ?? resolve(config.root, ".localpad/bridge-token");
      allowedPorts = test ? [test.port] : [5173, 4173];
    },
    async configureServer(server) {
      server.middlewares.use(await initialize());
    },
    async configurePreviewServer(server) {
      server.middlewares.use(await initialize());
    },
  };
}
