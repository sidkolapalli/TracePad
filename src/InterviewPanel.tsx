import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CircleDot,
  FilePlus2,
  MessageSquare,
  Radio,
  Unplug,
} from "lucide-react";
import type { Attempt, RequirementUpdate } from "./learning/types";

const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function RequirementList({
  updates,
  onAcknowledge,
  readOnly = false,
}: {
  updates: RequirementUpdate[];
  onAcknowledge: (id: string) => void;
  readOnly?: boolean;
}) {
  if (!updates.length) return null;
  return (
    <section className="requirement-list" aria-label="Additional requirements">
      <h2>
        Additional requirements <span>{updates.length}</span>
      </h2>
      {updates.map((update) => (
        <article
          className={`interview-update ${update.acknowledgedAt ? "" : "is-unread"}`}
          key={update.id}
        >
          <div className="update-meta">
            <span>{update.author}</span>
            <time dateTime={new Date(update.createdAt).toISOString()}>
              {time(update.createdAt)}
            </time>
          </div>
          <h3>{update.title}</h3>
          <p>{update.description}</p>
          {update.acknowledgedAt !== undefined ? (
            <span className="update-acknowledged">
              <Check size={13} /> Acknowledged
            </span>
          ) : readOnly ? (
            <span className="update-acknowledged">
              Not acknowledged before submission
            </span>
          ) : (
            <button
              className="text-button"
              onClick={() => onAcknowledge(update.id)}
            >
              <Check size={14} /> Acknowledge requirement
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

export function InterviewPanel({
  attempt,
  bridgeStatus,
  lastAgentSeenAt,
  pendingRequests,
  incomingQuestions,
  onOpenCoach,
  onStartPractice,
  onToggleLive,
  onAcknowledge,
  children,
}: {
  attempt: Attempt | null;
  bridgeStatus: "connecting" | "ready" | "offline";
  lastAgentSeenAt: number | null;
  pendingRequests: number;
  incomingQuestions: number;
  onOpenCoach: () => void;
  onStartPractice: () => void;
  onToggleLive: (enabled: boolean) => void;
  onAcknowledge: (id: string) => void;
  children?: ReactNode;
}) {
  const updates = attempt?.requirementUpdates ?? [];
  const events = attempt
    ? [
        {
          id: "start",
          at: attempt.startedAt,
          kind: "question",
          title: "Interview brief opened",
          detail:
            attempt.question.provenance.kind === "ai"
              ? `Question from ${attempt.question.provenance.generator}`
              : "Offline practice question",
        },
        ...updates.map((u) => ({
          id: `requirement-${u.id}`,
          at: u.createdAt,
          kind: "requirement",
          title: u.title,
          detail: `Requirement from ${u.author}`,
        })),
        ...attempt.hintsUsed.map((h, i) => ({
          id: `hint-${i}`,
          at: h.at,
          kind: "hint",
          title:
            h.source === "ai"
              ? "Assistant hint received"
              : "Practice hint revealed",
          detail: h.text,
        })),
        ...attempt.runs.map((r) => ({
          id: r.id,
          at: r.at,
          kind: "run",
          title:
            r.kind === "baseline"
              ? "Baseline checks"
              : r.kind === "scratch"
                ? "Scratch tests"
                : "Python run",
          detail: `${r.status.replaceAll("-", " ")}${r.results.length ? ` · ${r.results.filter((t) => t.passed).length}/${r.results.length} passed` : ""}`,
        })),
        ...(attempt.finishedAt
          ? [
              {
                id: "finish",
                at: attempt.finishedAt,
                kind: "finished",
                title: "Attempt submitted",
                detail: "Code and execution evidence saved for review",
              },
            ]
          : []),
      ].sort((a, b) => b.at - a.at)
    : [];
  return (
    <div className="interview-panel">
      <div className="sidebar-heading">
        <h2>{attempt ? "Your interview" : "Interview practice"}</h2>
        <Radio size={16} />
      </div>
      {(pendingRequests > 0 || incomingQuestions > 0) && (
        <button className="interview-pending" onClick={onOpenCoach}>
          <MessageSquare size={16} />
          <span>
            {incomingQuestions > 0
              ? `${incomingQuestions} question${incomingQuestions === 1 ? "" : "s"} ready to review`
              : "Request sent · waiting for your assistant"}
          </span>
          <ArrowRight size={14} />
        </button>
      )}
      {!attempt ? (
        <div className="interview-intro">
          <h3>Rehearse the real interview.</h3>
          <p>
            Work from a blank editor under a timer. Keep your approach notes,
            hints, and follow-up requirements here.
          </p>
          <button className="primary-button" onClick={onStartPractice}>
            Set up practice <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <>
          {children}
          {attempt.mode === "mock" && (
            <div className="live-interview-setting">
              <label>
                <input
                  type="checkbox"
                  checked={attempt.liveInterviewer ?? false}
                  disabled={attempt.finishedAt !== null}
                  onChange={(e) => onToggleLive(e.target.checked)}
                />
                <span>
                  <strong>Allow live interview updates</strong>
                  <small>
                    Receive additional requirements from your connected
                    assistant during this mock.
                  </small>
                </span>
              </label>
            </div>
          )}
          {attempt.finishedAt !== null && (
            <RequirementList
              updates={updates}
              onAcknowledge={onAcknowledge}
              readOnly
            />
          )}
          <details className="interview-activity">
            <summary>
              Activity <span>{events.length} events</span>
            </summary>
            <p className="activity-caption">
              Most recent first{events.length > 10 ? " · latest 10 events" : ""}
            </p>
            <ol className="interview-timeline">
              {events.slice(0, 10).map((event) => (
                <li key={event.id}>
                  <span className="timeline-icon">
                    {event.kind === "requirement" ? (
                      <FilePlus2 size={13} />
                    ) : event.kind === "hint" ? (
                      <MessageSquare size={13} />
                    ) : (
                      <CircleDot size={13} />
                    )}
                  </span>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                  </div>
                  <time dateTime={new Date(event.at).toISOString()}>
                    {time(event.at)}
                  </time>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      <details className="connection-disclosure">
        <summary>
          Assistant connection{" "}
          <span>
            {bridgeStatus === "ready"
              ? "Local bridge ready"
              : bridgeStatus === "offline"
                ? "Offline"
                : "Connecting…"}
          </span>
        </summary>
        <div className="interviewer-connection">
          {bridgeStatus === "offline" ? (
            <Unplug size={16} />
          ) : (
            <CircleDot size={16} />
          )}
          <div>
            <strong>
              {bridgeStatus === "ready"
                ? "Local connection ready"
                : bridgeStatus === "connecting"
                  ? "Connecting to local bridge…"
                  : "Local connection unavailable"}
            </strong>
            <p>
              {lastAgentSeenAt
                ? `Last assistant activity at ${time(lastAgentSeenAt)}. This does not mean an assistant is currently watching.`
                : "Connect an assistant to receive questions and guidance here."}
            </p>
          </div>
          <button className="text-button" onClick={onOpenCoach}>
            Connect <ArrowRight size={13} />
          </button>
        </div>
      </details>
    </div>
  );
}
