import type { RunRequest, RunnerEvent } from "./types";

export const EXECUTION_TIMEOUT_MS = 10_000;
export const INITIALIZATION_TIMEOUT_MS = 30_000;

type CompletionStatus = Extract<RunnerEvent, { type: "complete" }>["status"];

/** Owns one disposable Python worker. No Python execution occurs on the UI thread. */
export class PythonRunner {
  private worker: Worker | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private current: {
    request: RunRequest;
    onEvent: (event: RunnerEvent) => void;
    started: number;
  } | null = null;

  run(request: RunRequest, onEvent: (event: RunnerEvent) => void): void {
    this.destroy();
    const current = { request, onEvent, started: performance.now() };
    this.current = current;
    onEvent({ type: "status", runId: request.runId, status: "loading" });

    try {
      const worker = new Worker(
        new URL("./python.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker = worker;
      this.timeout = setTimeout(() => {
        this.finish(
          "failed",
          "Python could not start within 30 seconds. Check the local runtime files and try again.",
        );
      }, INITIALIZATION_TIMEOUT_MS);

      worker.onmessage = (message: MessageEvent<RunnerEvent>) => {
        // The identity check also rejects a queued message from an already terminated worker.
        if (
          this.worker !== worker ||
          this.current !== current ||
          message.data.runId !== request.runId
        )
          return;
        const event = message.data;
        if (event.type === "status" && event.status === "running") {
          this.clearTimeout();
          current.started = performance.now();
          this.timeout = setTimeout(() => {
            this.finish(
              "timed-out",
              "Execution exceeded the 10-second limit. You can edit your code and run again.",
            );
          }, EXECUTION_TIMEOUT_MS);
        }
        if (event.type === "complete") this.destroy();
        onEvent(event);
      };
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault();
        if (this.worker !== worker) return;
        this.finish(
          "failed",
          event.message ||
            "The Python worker could not start. Try running again.",
        );
      };
      worker.onmessageerror = () => {
        if (this.worker === worker)
          this.finish(
            "failed",
            "The Python worker returned an unreadable response. Try running again.",
          );
      };
      worker.postMessage(request);
    } catch (error) {
      this.finish(
        "failed",
        error instanceof Error
          ? error.message
          : "The Python worker could not start.",
      );
    }
  }

  stop(): void {
    this.finish("stopped", "Execution stopped.");
  }

  /** Release resources without updating a component that may already have unmounted. */
  destroy(): void {
    this.clearTimeout();
    this.worker?.terminate();
    this.worker = null;
    this.current = null;
  }

  private clearTimeout(): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private finish(status: CompletionStatus, message: string): void {
    const current = this.current;
    if (!current) return;
    const elapsedMs = performance.now() - current.started;
    this.destroy();
    current.onEvent({
      type: "complete",
      runId: current.request.runId,
      status,
      elapsedMs,
      message,
    });
  }
}
