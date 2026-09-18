import { useEffect, useRef, useState } from "react";
import type { BridgeCommand, PracticeSnapshot } from "./types";

export function getInstanceId(): string {
  return crypto.randomUUID();
}

/** Same-origin local transport only. The MCP process never edits the editor directly. */
export function usePracticeBridge(
  snapshot: PracticeSnapshot,
  ackIds: string[],
  suspended = false,
) {
  const latest = useRef({ snapshot, ackIds });
  latest.current = { snapshot, ackIds };
  const [commands, setCommands] = useState<BridgeCommand[]>([]);
  const [status, setStatus] = useState<"connecting" | "ready" | "offline">(
    "connecting",
  );
  const [lastAgentSeenAt, setLastAgentSeenAt] = useState<number | null>(null);
  useEffect(() => {
    if (suspended) return;
    const connectionId = crypto.randomUUID();
    const instanceId = latest.current.snapshot.instanceId;
    let disposed = false;
    let pending = false;
    let controller: AbortController | null = null;
    const sync = async () => {
      if (pending || disposed) return;
      pending = true;
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 4000);
      try {
        const response = await fetch("/api/localpad/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Localpad": "1" },
          body: JSON.stringify({ ...latest.current, connectionId }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Bridge unavailable");
        const data = await response.json();
        if (!disposed) {
          setStatus("ready");
          setCommands(
            Array.isArray(data.commands)
              ? data.commands.filter(
                  (c: BridgeCommand) => !latest.current.ackIds.includes(c.id),
                )
              : [],
          );
          setLastAgentSeenAt(data.lastAgentSeenAt ?? null);
        }
      } catch {
        if (!disposed) setStatus("offline");
      } finally {
        clearTimeout(deadline);
        pending = false;
      }
    };
    void sync();
    const interval = setInterval(sync, 1500);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      void fetch("/api/localpad/detach", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Localpad": "1" },
        body: JSON.stringify({ instanceId, connectionId }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [suspended]);
  return { commands, status, lastAgentSeenAt };
}
