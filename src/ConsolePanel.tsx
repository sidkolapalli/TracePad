import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Eraser, FileCode2 } from "lucide-react";
import type { RunStatus } from "./types";

interface ConsolePanelProps {
  output: { stream: string; text: string }[];
  status: RunStatus;
  runId: string;
  message: string;
  cleared: boolean;
  onClear: () => void;
  onOpenInput: () => void;
}

/** Display-only controls never modify the captured run or its saved evidence. */
export function ConsolePanel({
  output,
  status,
  runId,
  message,
  cleared,
  onClear,
  onOpenInput,
}: ConsolePanelProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const busy = status === "loading" || status === "running";
  const visibleOutput = cleared ? [] : output;
  const visibleMessage = cleared ? "" : message;
  const text = visibleOutput.map((chunk) => chunk.text).join("");
  const hasContent = !!text || !!visibleMessage;

  useEffect(() => {
    setCopyState("idle");
    followOutput.current = true;
  }, [runId, cleared]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && followOutput.current)
      element.scrollTop = element.scrollHeight;
  }, [output, message, cleared, status]);

  const copyOutput = async () => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text || visibleMessage);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const emptyTitle = cleared
    ? "Output cleared."
    : status === "loading"
      ? "Starting Python…"
      : status === "running"
        ? "Running main.py…"
        : status === "completed"
          ? "Finished without output"
          : "Console is ready.";

  return (
    <div
      className="console-panel python-console"
      role="tabpanel"
      id="panel-console"
      aria-labelledby="tab-console"
    >
      <div className="console-session-bar">
        <div className="console-session-file">
          <FileCode2 size={14} aria-hidden="true" />
          <code>main.py</code>
          <span>Python</span>
        </div>
        <div className="console-actions">
          <button
            type="button"
            aria-label="Copy output"
            title="Copy output"
            disabled={busy || !hasContent}
            onClick={() => void copyOutput()}
          >
            {copyState === "copied" ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            <span>Copy</span>
          </button>
          <button
            type="button"
            aria-label="Clear output"
            title="Clear displayed output; saved interview evidence is retained"
            disabled={busy || !hasContent}
            onClick={onClear}
          >
            <Eraser size={14} aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </div>
      <p className="console-copy-feedback" role="status">
        {copyState === "copied"
          ? "Copied output."
          : copyState === "failed"
            ? "Copy failed. Select the output and copy it manually."
            : ""}
      </p>
      <div
        className="console-viewport"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Python output"
        onScroll={(event) => {
          const element = event.currentTarget;
          followOutput.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            32;
        }}
      >
        {!hasContent && (
          <div className="console-empty">
            <p>{emptyTitle}</p>
            <p className="console-guidance">
              {cleared ? (
                "Run again to show new output. Saved interview evidence is unchanged."
              ) : status === "completed" ? (
                "Use print() to see values here."
              ) : busy ? (
                "Output will appear as your program writes it."
              ) : (
                <>
                  Run main.py to see output here. <kbd>Ctrl / ⌘ + Enter</kbd>
                </>
              )}
            </p>
          </div>
        )}
        <pre className="console-output">
          {visibleOutput.map((chunk, index) => (
            <span
              className={chunk.stream === "stderr" ? "stderr" : undefined}
              title={chunk.stream === "stderr" ? "Standard error" : undefined}
              key={index}
            >
              {chunk.text}
            </span>
          ))}
        </pre>
        {visibleMessage && (
          <div
            className={`run-message console-run-message ${status === "completed" ? "" : "error-message"}`}
          >
            {visibleMessage}
          </div>
        )}
      </div>
      <div className="console-input-note">
        <span>
          Need <code>input()</code>?
        </span>
        <button type="button" onClick={onOpenInput}>
          Set it in the Input tab
        </button>
        <span>before running.</span>
      </div>
    </div>
  );
}
