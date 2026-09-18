import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXECUTION_TIMEOUT_MS,
  INITIALIZATION_TIMEOUT_MS,
  PythonRunner,
} from "./runner";
import type { RunRequest, RunnerEvent } from "./types";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<RunnerEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(
    public url: URL,
    public options: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }
  emit(event: RunnerEvent) {
    this.onmessage?.({ data: event } as MessageEvent<RunnerEvent>);
  }
}

const request = (runId: string): RunRequest => ({
  runId,
  source: "print(42)",
  stdin: "",
});

describe("PythonRunner worker lifecycle", () => {
  let runner: PythonRunner;
  let events: RunnerEvent[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.instances = [];
    runner = new PythonRunner();
    events = [];
  });

  afterEach(() => {
    runner.destroy();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("creates a fresh module worker, forwards the request, and disposes after completion", () => {
    const firstRequest = request("first");
    runner.run(firstRequest, (event) => events.push(event));
    const worker = FakeWorker.instances[0];
    expect(worker.options.type).toBe("module");
    expect(worker.postMessage).toHaveBeenCalledWith(firstRequest);
    expect(events).toEqual([
      { type: "status", runId: "first", status: "loading" },
    ]);

    worker.emit({ type: "status", runId: "first", status: "running" });
    worker.emit({
      type: "output",
      runId: "first",
      stream: "stdout",
      text: "42\n",
    });
    worker.emit({
      type: "complete",
      runId: "first",
      status: "completed",
      elapsedMs: 12,
    });
    expect(events.at(-2)).toMatchObject({ type: "output", text: "42\n" });
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      status: "completed",
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    runner.run(request("second"), (event) => events.push(event));
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("stops immediately and ignores already queued events from stopped and superseded workers", () => {
    runner.run(request("first"), (event) => events.push(event));
    const first = FakeWorker.instances[0];
    const queued = first.onmessage!;
    runner.stop();
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      runId: "first",
      status: "stopped",
    });
    queued({
      data: { type: "status", runId: "first", status: "running" },
    } as MessageEvent<RunnerEvent>);
    expect(events.at(-1)).toMatchObject({ status: "stopped" });

    runner.run(request("second"), (event) => events.push(event));
    queued({
      data: {
        type: "complete",
        runId: "first",
        status: "completed",
        elapsedMs: 1,
      },
    } as MessageEvent<RunnerEvent>);
    FakeWorker.instances[1].emit({
      type: "output",
      runId: "wrong-id",
      stream: "stdout",
      text: "stale",
    });
    expect(events.at(-1)).toMatchObject({ runId: "second", status: "loading" });
  });

  it("starts the execution watchdog only after initialization", () => {
    runner.run(request("slow-load"), (event) => events.push(event));
    vi.advanceTimersByTime(INITIALIZATION_TIMEOUT_MS - 1);
    expect(events.at(-1)).toMatchObject({ status: "loading" });
    const worker = FakeWorker.instances[0];
    worker.emit({ type: "status", runId: "slow-load", status: "running" });
    vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS - 1);
    expect(events.at(-1)).toMatchObject({ status: "running" });
    vi.advanceTimersByTime(1);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      status: "timed-out",
      elapsedMs: EXECUTION_TIMEOUT_MS,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("fails a hung initialization and permits a clean retry", () => {
    runner.run(request("hang"), (event) => events.push(event));
    vi.advanceTimersByTime(INITIALIZATION_TIMEOUT_MS);
    expect(events.at(-1)).toMatchObject({
      type: "complete",
      runId: "hang",
      status: "failed",
    });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    runner.run(request("retry"), (event) => events.push(event));
    FakeWorker.instances[1].emit({
      type: "status",
      runId: "retry",
      status: "running",
    });
    FakeWorker.instances[1].emit({
      type: "complete",
      runId: "retry",
      status: "completed",
      elapsedMs: 1,
    });
    expect(events.at(-1)).toMatchObject({
      runId: "retry",
      status: "completed",
    });
  });

  it("allows a slow cold start without extending the execution limit", () => {
    runner.run(request("cold-start"), (event) => events.push(event));
    const worker = FakeWorker.instances[0];
    vi.advanceTimersByTime(45_000);
    expect(events.at(-1)).toMatchObject({ status: "loading" });
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit({ type: "status", runId: "cold-start", status: "running" });
    vi.advanceTimersByTime(EXECUTION_TIMEOUT_MS);
    expect(events.at(-1)).toMatchObject({
      status: "timed-out",
      elapsedMs: EXECUTION_TIMEOUT_MS,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates output floods and worker failures without leaving a watchdog", () => {
    runner.run(request("flood"), (event) => events.push(event));
    FakeWorker.instances[0].emit({
      type: "complete",
      runId: "flood",
      status: "output-limit",
      elapsedMs: 1,
    });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    runner.run(request("failure"), (event) => events.push(event));
    const error = {
      message: "Runtime asset unavailable",
      preventDefault: vi.fn(),
    };
    FakeWorker.instances[1].onerror!(error as unknown as ErrorEvent);
    expect(error.preventDefault).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({
      status: "failed",
      message: "Runtime asset unavailable",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("silently destroys an unmounted runner and cancels a run replaced before initialization", () => {
    runner.run(request("old"), (event) => events.push(event));
    runner.run(request("new"), (event) => events.push(event));
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(events).toHaveLength(2);
    runner.destroy();
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(INITIALIZATION_TIMEOUT_MS);
    runner.stop();
    expect(events).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
