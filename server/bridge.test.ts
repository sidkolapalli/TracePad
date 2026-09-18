import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBridgeMiddleware } from "./bridge";
import {
  questionSchema,
  snapshotSchema,
  type AgentOperation,
  type Snapshot,
} from "./contracts";
import { createLocalpadMcpServer, validateLocalpadUrl } from "./mcp";

const token = "0123456789abcdef".repeat(4);
const question = {
  schemaVersion: 1 as const,
  id: "question-1",
  topicId: "python.oop.instance-state" as const,
  level: "foundation" as const,
  title: "A counter",
  prompt: "Implement Counter with value initially zero.",
  starterCode: "class Counter:\n    pass\n",
  examples: [],
  constraints: [],
  baselineTests: [
    { id: "zero", name: "Initial value", code: "assert Counter().value == 0" },
  ],
  hints: ["Use an instance attribute."],
  referenceSolution:
    "class Counter:\n    def __init__(self):\n        self.value = 0\n",
  learningObjectives: ["Keep independent instance state"],
  recommendedMinutes: 15,
  provenance: { kind: "ai" as const, generator: "test" },
};
function makeSnapshot(time = 1_000): Snapshot {
  const { referenceSolution: _reference, ...publicQuestion } = question;
  return {
    schemaVersion: 1,
    instanceId: "browser-1",
    updatedAt: time,
    app: "localpad",
    activeExercise: {
      id: question.id,
      title: question.title,
      prompt: question.prompt,
      topic: question.topicId,
    },
    source: question.starterCode,
    stdin: "",
    notes: "",
    timer: { remainingMs: 900_000, running: true },
    activeAttempt: {
      id: "attempt-1",
      question: publicQuestion,
      mode: "drill",
      durationMs: 900_000,
      startedAt: time,
      finishedAt: null,
      deadline: time + 900_000,
      source: question.starterCode,
      stdin: "",
      scratchTests: [],
      notes: "",
      hintsUsed: [],
      pauseEvents: [],
      runs: [],
      selfCheck: {
        clarified: false,
        explained: false,
        respondedToHints: false,
      },
      feedback: [],
    },
    recentAttempts: [],
    history: [],
    requests: [],
  };
}

describe("local practice bridge", () => {
  let http: Server;
  let origin: string;
  let clock: number;
  beforeEach(async () => {
    clock = 1_000;
    const ports: number[] = [];
    const middleware = createBridgeMiddleware({
      token,
      allowedPorts: ports,
      now: () => clock,
    });
    http = createServer((req, res) =>
      middleware(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
    );
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const port = (http.address() as { port: number }).port;
    ports.push(port);
    origin = `http://127.0.0.1:${port}`;
  });
  afterEach(async () => {
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
  });
  async function sync(snapshot = makeSnapshot(), ackIds: string[] = []) {
    return fetch(`${origin}/api/localpad/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Localpad": "1",
        Origin: origin,
      },
      body: JSON.stringify({ snapshot, ackIds }),
    });
  }
  async function agent(operation: AgentOperation) {
    return fetch(`${origin}/api/localpad/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(operation),
    });
  }
  it("binds MCP writes to a project and rejects instance reassignment", async () => {
    const snapshot = {
      ...makeSnapshot(),
      project: { id: "project-a", name: "Backend interview" },
    };
    expect((await sync(snapshot)).status).toBe(200);
    expect(
      (
        await agent({
          operation: "submit_question",
          instanceId: snapshot.instanceId,
          question,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await agent({
          operation: "submit_question",
          instanceId: snapshot.instanceId,
          projectId: "project-b",
          question,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await agent({
          operation: "submit_question",
          instanceId: snapshot.instanceId,
          projectId: "project-a",
          question,
        })
      ).status,
    ).toBe(200);
    const delivery = await (await sync(snapshot)).json();
    expect(delivery.commands[0].projectId).toBe("project-a");
    expect(
      (
        await sync({
          ...snapshot,
          project: { id: "project-b", name: "Another interview" },
        })
      ).status,
    ).toBe(409);
  });
  it("detaches closed connections without removing a replacement connection", async () => {
    const post = (path: string, payload: unknown) =>
      fetch(`${origin}/api/localpad/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Localpad": "1" },
        body: JSON.stringify(payload),
      });
    const snapshot = makeSnapshot();
    await post("sync", { snapshot, ackIds: [], connectionId: "old" });
    await post("sync", { snapshot, ackIds: [], connectionId: "new" });
    await post("detach", {
      instanceId: snapshot.instanceId,
      connectionId: "old",
    });
    expect(
      (
        await agent({
          operation: "get_snapshot",
          instanceId: snapshot.instanceId,
        })
      ).status,
    ).toBe(200);
    expect(
      (await post("sync", { snapshot, ackIds: [], connectionId: "old" }))
        .status,
    ).toBe(409);
    await post("detach", {
      instanceId: snapshot.instanceId,
      connectionId: "new",
    });
    expect(
      (
        await agent({
          operation: "get_snapshot",
          instanceId: snapshot.instanceId,
        })
      ).status,
    ).toBe(404);
  });
  it("requires bearer auth and rejects foreign origins, forged hosts, and simple browser POSTs", async () => {
    const privateRead = await fetch(`${origin}/api/localpad/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "list_instances" }),
    });
    expect(privateRead.status).toBe(401);
    expect(
      (
        await fetch(`${origin}/api/localpad/schema`, {
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
    ).toBe(403);
    // fetch normalizes Host; use a raw HTTP request to exercise rebinding protection.
    const forgedHostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          `${origin}/api/localpad/schema`,
          { headers: { Host: "attacker.example:5173" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    expect(forgedHostStatus).toBe(403);
    expect(
      (
        await fetch(`${origin}/api/localpad/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: makeSnapshot(), ackIds: [] }),
        })
      ).status,
    ).toBe(403);
    expect((await sync()).status).toBe(200);
  });
  it("exports versioned schemas and portable configuration without token data", async () => {
    const schemas = await (await fetch(`${origin}/api/localpad/schema`)).json();
    expect(schemas.schemaVersion).toBe(1);
    expect(schemas.question.required).toContain("referenceSolution");
    const data = await (
      await fetch(`${origin}/api/localpad/connection`)
    ).json();
    expect(data.config.mcpServers.localpad.command).toBe(process.execPath);
    expect(data.config.mcpServers.localpad.args[1]).toMatch(/^file:\/\//);
    expect(JSON.stringify(data)).not.toContain(token);
    for (const path of [
      "/.localpad/bridge-token",
      "/@fs/C:/app/.localpad/bridge-token?raw",
      "/%2elocalpad%2fbridge-token",
    ]) {
      expect((await fetch(`${origin}${path}`)).status).toBe(403);
    }
  });
  it("rejects invalid schema versions and oversized payloads", async () => {
    const invalid = makeSnapshot();
    (invalid as unknown as { schemaVersion: number }).schemaVersion = 2;
    expect((await sync(invalid)).status).toBe(400);
    const oversized = makeSnapshot();
    oversized.source = "x".repeat(1_048_576);
    expect((await sync(oversized)).status).toBe(413);
  });
  it("reports instance freshness and rejects commands after the browser goes stale", async () => {
    await sync();
    const initial = await (
      await agent({ operation: "get_snapshot", instanceId: "browser-1" })
    ).json();
    expect(initial.freshness.status).toBe("fresh");
    clock += 31_000;
    const stale = await (
      await agent({ operation: "get_snapshot", instanceId: "browser-1" })
    ).json();
    expect(stale.freshness.status).toBe("stale");
    expect(
      (
        await agent({
          operation: "submit_question",
          instanceId: "browser-1",
          question,
        })
      ).status,
    ).toBe(409);
    expect((await sync()).status).toBe(200);
    expect(
      (
        await agent({
          operation: "submit_question",
          instanceId: "browser-1",
          question,
        })
      ).status,
    ).toBe(200);
  });
  it("delivers questions once per command ID, retries idempotently, and bounds pending commands", async () => {
    await sync();
    const operation = {
      operation: "submit_question" as const,
      instanceId: "browser-1",
      question,
    };
    const first = await (await agent(operation)).json();
    expect(first.state).toBe("queued");
    const again = await (await agent(operation)).json();
    expect(again).toMatchObject({
      commandId: first.commandId,
      duplicate: true,
    });
    const browser = await (await sync()).json();
    expect(browser.commands).toHaveLength(1);
    expect(browser.lastAgentSeenAt).toBe(clock);
    const ack = await (await sync(makeSnapshot(), [first.commandId])).json();
    expect(ack.commands).toHaveLength(0);
    expect(await (await agent(operation)).json()).toMatchObject({
      commandId: first.commandId,
      duplicate: true,
      state: "delivered",
    });
    expect(
      (
        await agent({
          ...operation,
          question: { ...question, title: "Different content" },
        })
      ).status,
    ).toBe(409);
    for (let i = 0; i < 30; i++)
      expect(
        (
          await agent({
            ...operation,
            question: { ...question, id: `queued-${i}` },
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await agent({
          ...operation,
          question: { ...question, id: "queue-overflow" },
        })
      ).status,
    ).toBe(429);
  });
  it("requires a matching learner hint request on the current unfinished attempt", async () => {
    const snapshot = makeSnapshot();
    await sync(snapshot);
    const operation = {
      operation: "provide_hint" as const,
      instanceId: "browser-1",
      attemptId: "attempt-1",
      requestId: "hint-1",
      text: "Check your constructor.",
    };
    expect((await agent(operation)).status).toBe(409);
    snapshot.requests = [
      {
        id: "hint-1",
        kind: "hint",
        topicId: question.topicId,
        level: "foundation",
        mode: "drill",
        attemptId: "attempt-1",
        instructions: "",
        createdAt: clock,
      },
    ];
    await sync(snapshot);
    expect((await agent({ ...operation, attemptId: "wrong" })).status).toBe(
      409,
    );
    expect((await agent(operation)).status).toBe(200);
    snapshot.requests = [];
    await sync(snapshot);
    expect(await (await agent(operation)).json()).toMatchObject({
      duplicate: true,
    });
  });
  it("accepts immutable requirement updates only for an opted-in active mock, and retries exactly once", async () => {
    const snapshot = makeSnapshot();
    const update = {
      id: "requirement-1",
      title: "Add validation",
      description: "Reject negative additions with ValueError.",
      author: "Interview coach",
      createdAt: clock,
    };
    const operation = {
      operation: "submit_requirement" as const,
      instanceId: "browser-1",
      attemptId: "attempt-1",
      update,
    };
    await sync(snapshot);
    expect((await agent(operation)).status).toBe(409);
    snapshot.activeAttempt!.mode = "mock";
    await sync(snapshot);
    expect((await agent(operation)).status).toBe(409);
    snapshot.activeAttempt!.liveInterviewer = true;
    snapshot.files = { "helpers.py": "VALUE = 42" };
    snapshot.activeFile = "helpers.py";
    await sync(snapshot);
    expect((await agent({ ...operation, attemptId: "wrong" })).status).toBe(
      409,
    );
    const first = await (await agent(operation)).json();
    expect(first).toMatchObject({ duplicate: false, state: "queued" });
    expect(await (await agent(operation)).json()).toMatchObject({
      duplicate: true,
      commandId: first.commandId,
    });
    const delivered = await (await sync(snapshot)).json();
    expect(delivered.commands).toEqual([
      {
        id: first.commandId,
        type: "requirement",
        attemptId: "attempt-1",
        update,
      },
    ]);
    snapshot.activeAttempt!.requirementUpdates = [
      { ...update, acknowledgedAt: clock + 1 },
    ];
    await sync(snapshot, [first.commandId]);
    expect(await (await agent(operation)).json()).toMatchObject({
      duplicate: true,
      state: "delivered",
    });
    expect(
      (
        await agent({
          ...operation,
          update: { ...update, description: "Changed" },
        })
      ).status,
    ).toBe(409);
    const read = await (
      await agent({ operation: "get_snapshot", instanceId: "browser-1" })
    ).json();
    expect(read.snapshot.files).toEqual(snapshot.files);
    expect(read.snapshot.source).toBe(question.starterCode);
    expect(read.snapshot.activeAttempt.requirementUpdates).toEqual(
      snapshot.activeAttempt!.requirementUpdates,
    );
    snapshot.activeAttempt!.finishedAt = clock + 2;
    await sync(snapshot);
    expect(
      (await agent({ ...operation, update: { ...update, id: "later" } }))
        .status,
    ).toBe(409);
  });
  it("only reviews completed attempts and rejects evidence IDs outside the attempt", async () => {
    const snapshot = makeSnapshot();
    await sync(snapshot);
    const operation = {
      operation: "submit_feedback" as const,
      instanceId: "browser-1",
      feedback: {
        id: "review-1",
        attemptId: "attempt-1",
        reviewer: "test",
        createdAt: clock,
        summary: "Use independent state.",
        strengths: [],
        improvements: [],
        nextPractice: "Composition",
        evidenceRunIds: [],
      },
    };
    expect((await agent(operation)).status).toBe(409);
    snapshot.activeAttempt!.finishedAt = clock + 100;
    snapshot.recentAttempts = [snapshot.activeAttempt!];
    snapshot.activeAttempt = null;
    await sync(snapshot);
    expect(
      (
        await agent({
          ...operation,
          feedback: { ...operation.feedback, evidenceRunIds: ["invented-run"] },
        })
      ).status,
    ).toBe(400);
    expect((await agent(operation)).status).toBe(200);
    const result = await (
      await agent({
        operation: "get_attempt",
        instanceId: "browser-1",
        attemptId: "attempt-1",
      })
    ).json();
    expect(result.attempt.finishedAt).toBe(clock + 100);
    expect(result.attempt.question).not.toHaveProperty("referenceSolution");
  });
  it("initializes a real MCP client and reads/writes the HTTP bridge through standard tools", async () => {
    await sync();
    const mcp = createLocalpadMcpServer(async (operation) => {
      const response = await agent(operation);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result;
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await mcp.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(
        [
          "list_instances",
          "get_snapshot",
          "get_attempt",
          "submit_question",
          "provide_hint",
          "submit_requirement",
          "submit_feedback",
        ],
      );
      const instances = await client.callTool({
        name: "list_instances",
        arguments: {},
      });
      expect(instances.structuredContent).toMatchObject({
        schemaVersion: 1,
        instances: [{ instanceId: "browser-1" }],
      });
      const queued = await client.callTool({
        name: "submit_question",
        arguments: { instanceId: "browser-1", question },
      });
      expect(queued.isError).not.toBe(true);
      expect((await (await sync()).json()).commands).toHaveLength(1);
      const forbidden = await client.callTool({
        name: "provide_hint",
        arguments: {
          instanceId: "browser-1",
          attemptId: "attempt-1",
          requestId: "unsolicited",
          text: "No",
        },
      });
      expect(forbidden.isError).toBe(true);
      expect(
        (await client.readResource({ uri: "localpad://schema/question" }))
          .contents[0],
      ).toHaveProperty("text");
      expect(
        (await client.getPrompt({ name: "interview_coach", arguments: {} }))
          .messages[0].role,
      ).toBe("user");
    } finally {
      await client.close();
      await mcp.close();
    }
  });
});

it("starts the stdio MCP server outside the workspace using absolute import paths", async () => {
  const client = new Client({ name: "stdio-smoke", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      pathToFileURL(
        fileURLToPath(
          new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url),
        ),
      ).href,
      fileURLToPath(new URL("./mcp.ts", import.meta.url)),
    ],
    cwd: tmpdir(),
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(7);
    expect(
      (await client.listResources()).resources.map((resource) => resource.uri),
    ).toContain("localpad://topics");
  } finally {
    await client.close();
  }
}, 15_000);

it("keeps contracts strict and limits the MCP proxy to supported loopback origins", () => {
  expect(questionSchema.safeParse(question).success).toBe(true);
  expect(
    questionSchema.safeParse({ ...question, surprise: true }).success,
  ).toBe(false);
  expect(snapshotSchema.safeParse(makeSnapshot()).success).toBe(true);
  expect(validateLocalpadUrl("http://127.0.0.1:5173/")).toBe(
    "http://127.0.0.1:5173",
  );
  for (const url of [
    "https://example.com",
    "http://127.0.0.1:5173/other",
    "http://user:secret@127.0.0.1:5173",
    "http://127.0.0.1:7777",
    "http://127.0.0.1:56173",
    "http://127.0.0.1:54173",
    "http://0.0.0.0:5173",
  ])
    expect(() => validateLocalpadUrl(url)).toThrow();
});

it("keeps an isolated MCP process on its test port and rejects normal app servers", () => {
  vi.stubEnv("LOCALPAD_E2E_RUN_ID", "8f631464-60f2-4e46-bf3f-0e1db9bba60c");
  vi.stubEnv("LOCALPAD_E2E_MODE", "development");
  try {
    expect(validateLocalpadUrl("http://127.0.0.1:56173")).toBe(
      "http://127.0.0.1:56173",
    );
    for (const port of [5173, 4173, 54173])
      expect(() => validateLocalpadUrl(`http://127.0.0.1:${port}`)).toThrow();
    vi.stubEnv("LOCALPAD_E2E_MODE", "production");
    expect(validateLocalpadUrl("http://127.0.0.1:54173")).toBe(
      "http://127.0.0.1:54173",
    );
    expect(() => validateLocalpadUrl("http://0.0.0.0:54173")).toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
});
