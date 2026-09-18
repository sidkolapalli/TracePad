import { useId } from "react";
import type { Scratchpad } from "../scratchpad/model";
import { INTERVIEW_PHASES, journeySummary } from "./journey";
import type { Attempt } from "./types";
import "./debrief.css";

function duration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1_000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function ScratchpadSnapshot({ scratchpad }: { scratchpad: Scratchpad }) {
  const nodes = new Map(scratchpad.flow.nodes.map((node) => [node.id, node]));
  const shapeNames = {
    start: "Start",
    process: "Step",
    decision: "Decision",
    end: "End",
  };
  return (
    <details className="debrief-disclosure">
      <summary>Submitted scratchpad</summary>
      <p className="debrief-explanation">
        Saved with this submission. Later edits to your working scratchpad do
        not change this record. Trace tables are manual reasoning, not execution
        results.
      </p>
      <h5>Notes</h5>
      {scratchpad.notes ? (
        <p className="debrief-written-content">{scratchpad.notes}</p>
      ) : (
        <p className="debrief-explanation">No scratchpad notes recorded.</p>
      )}
      <h5>Trace table</h5>
      {scratchpad.trace.rows.length ? (
        <div
          className="debrief-table-scroll debrief-trace-scroll"
          role="region"
          aria-label="Submitted trace table"
          tabIndex={0}
        >
          <table className="debrief-table debrief-trace-table">
            <caption className="debrief-visually-hidden">
              Trace table captured at submission
            </caption>
            <thead>
              <tr>
                <th scope="col" className="debrief-row-number">
                  Row
                </th>
                {scratchpad.trace.columns.map((column, index) => (
                  <th scope="col" key={column.id}>
                    {column.name || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scratchpad.trace.rows.map((row, index) => (
                <tr key={row.id}>
                  <th scope="row" className="debrief-row-number">
                    {index + 1}
                  </th>
                  {scratchpad.trace.columns.map((column) => (
                    <td key={column.id}>{row.cells[column.id] || ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="debrief-explanation">No trace rows recorded.</p>
      )}
      <h5>Flowchart outline</h5>
      {scratchpad.flow.nodes.length ? (
        <ol className="debrief-flow-outline">
          {scratchpad.flow.nodes.map((node, index) => {
            const outgoing = scratchpad.flow.edges.filter(
              (edge) => edge.source === node.id,
            );
            return (
              <li key={node.id}>
                <p>
                  <strong>{node.label || `Untitled step ${index + 1}`}</strong>
                  <span className="debrief-shape">{shapeNames[node.type]}</span>
                </p>
                {outgoing.length ? (
                  <ul>
                    {outgoing.map((edge) => (
                      <li key={edge.id}>
                        {edge.label ? (
                          <>
                            <strong>{edge.label}</strong>:{" "}
                          </>
                        ) : null}
                        Go to step{" "}
                        {scratchpad.flow.nodes.findIndex(
                          (target) => target.id === edge.target,
                        ) + 1}
                        {nodes.get(edge.target)?.label
                          ? `: ${nodes.get(edge.target)?.label}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="debrief-explanation">
                    No outgoing connections.
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="debrief-explanation">No flowchart recorded.</p>
      )}
    </details>
  );
}

/** Displays only the attempt's submitted record, never the current editor draft. */
export function InterviewDebrief({ attempt }: { attempt: Attempt }) {
  const headingId = useId();
  if (attempt.finishedAt === null) return null;
  const summary = journeySummary(attempt, attempt.finishedAt);
  const journey = attempt.interviewJourney;
  const requirements = attempt.requirementUpdates ?? [];
  const practiceRuns = attempt.runs.filter((run) => run.kind !== "baseline");
  const relativeTime = (at: number) => duration(at - attempt.startedAt);
  const phaseAt = (at: number) => {
    const transition = journey?.transitions
      .filter((item) => item.at <= at)
      .sort((a, b) => a.at - b.at)
      .at(-1);
    return (
      INTERVIEW_PHASES.find((phase) => phase.id === transition?.phase)?.title ??
      "Phase not tracked"
    );
  };
  return (
    <section className="interview-debrief" aria-labelledby={headingId}>
      <h4 id={headingId}>
        {attempt.mode === "mock" ? "Interview debrief" : "Practice record"}
      </h4>
      {attempt.mode === "mock" && (
        <section className="debrief-pacing" aria-label="Where the time went">
          <h5>Where the time went</h5>
          <div
            className="debrief-table-scroll"
            role="region"
            aria-label="Time by interview phase"
            tabIndex={0}
          >
            <table className="debrief-table debrief-pacing-table">
              <caption className="debrief-visually-hidden">
                Self-selected phase timing compared with the 60-minute interview
                outline
              </caption>
              <thead>
                <tr>
                  <th scope="col">Phase</th>
                  <th scope="col">Your time</th>
                  <th scope="col">Suggested window</th>
                </tr>
              </thead>
              <tbody>
                {summary.phases.map((phase) => (
                  <tr key={phase.id}>
                    <th scope="row">{phase.title}</th>
                    <td>
                      {!journey
                        ? "Not tracked"
                        : journey.transitions.some(
                              (transition) => transition.phase === phase.id,
                            )
                          ? duration(phase.elapsedMs)
                          : "Not selected"}
                    </td>
                    <td>
                      {phase.fromMinute}–{phase.toMinute} min
                    </td>
                  </tr>
                ))}
                {summary.untrackedMs > 0 && (
                  <tr>
                    <th scope="row">Untracked time</th>
                    <td>{duration(summary.untrackedMs)}</td>
                    <td>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="debrief-explanation">
            {journey
              ? "Time follows the phases you selected, including time away from the tab. Suggested windows are pacing guides, not scores."
              : "This attempt has no phase record. Its activity is preserved below, but time cannot be assigned to interview phases."}{" "}
            No audio is recorded or analyzed.
          </p>
        </section>
      )}
      {(journey?.clarifications || journey?.followupResponse) && (
        <details className="debrief-disclosure">
          <summary>Clarifications and follow-up response</summary>
          <h5>Clarifications</h5>
          <p
            className={
              journey.clarifications
                ? "debrief-written-content"
                : "debrief-explanation"
            }
          >
            {journey.clarifications || "No clarifications recorded."}
          </p>
          <h5>Response to the follow-up</h5>
          <p
            className={
              journey.followupResponse
                ? "debrief-written-content"
                : "debrief-explanation"
            }
          >
            {journey.followupResponse || "No follow-up response recorded."}
          </p>
        </details>
      )}
      <details className="debrief-disclosure">
        <summary>
          Assistance &amp; changes
          <span className="debrief-summary-meta">
            {attempt.hintsUsed.length}{" "}
            {attempt.hintsUsed.length === 1 ? "hint" : "hints"} ·{" "}
            {requirements.length}{" "}
            {requirements.length === 1 ? "requirement" : "requirements"}
          </span>
        </summary>
        <h5>Hints received</h5>
        {attempt.hintsUsed.length ? (
          <ol className="debrief-assistance-list">
            {attempt.hintsUsed.map((hint, index) => (
              <li key={`${hint.at}-${index}`}>
                <p className="debrief-event-context">
                  <time>{relativeTime(hint.at)}</time> · {phaseAt(hint.at)} ·{" "}
                  {hint.source === "ai" ? "Connected assistant" : "Local hint"}
                </p>
                <p className="debrief-written-content">{hint.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="debrief-explanation">No hints received.</p>
        )}
        <h5>Requirement changes</h5>
        {requirements.length ? (
          <ol className="debrief-assistance-list">
            {requirements.map((requirement) => (
              <li key={requirement.id}>
                <strong>{requirement.title}</strong>
                <p className="debrief-event-context">
                  Received <time>{relativeTime(requirement.createdAt)}</time> ·{" "}
                  {phaseAt(requirement.createdAt)} · {requirement.author}
                </p>
                <p className="debrief-written-content">
                  {requirement.description}
                </p>
                <p className="debrief-event-context">
                  {requirement.acknowledgedAt !== undefined ? (
                    <>
                      Acknowledged{" "}
                      <time>{relativeTime(requirement.acknowledgedAt)}</time> ·{" "}
                      {phaseAt(requirement.acknowledgedAt)}
                    </>
                  ) : (
                    "Not acknowledged before submission."
                  )}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="debrief-explanation">
            No follow-up requirement was received.
          </p>
        )}
      </details>
      <details className="debrief-disclosure">
        <summary>
          Your test evidence
          <span className="debrief-summary-meta">
            {practiceRuns.length} saved{" "}
            {practiceRuns.length === 1 ? "run" : "runs"}
          </span>
        </summary>
        <p className="debrief-explanation">
          Your custom checks and Python runs, separate from baseline tests.
          Results apply to the code saved at each run. Review the assertions to
          judge which requirements they cover, including the follow-up.
        </p>
        {practiceRuns.length ? (
          <div className="debrief-run-evidence">
            {practiceRuns.map((run) => {
              const cases = [
                ...run.tests.map((test) => ({
                  id: test.id,
                  name: test.name,
                  code: test.code,
                  result: run.results.find((result) => result.id === test.id),
                })),
                ...run.results
                  .filter(
                    (result) =>
                      !run.tests.some((test) => test.id === result.id),
                  )
                  .map((result) => ({
                    id: result.id,
                    name: result.name,
                    code: undefined,
                    result,
                  })),
              ];
              return (
                <details className="debrief-run" key={run.id}>
                  <summary>
                    <time>{relativeTime(run.at)}</time> ·{" "}
                    {run.kind === "scratch" ? "Custom tests" : "Python run"}
                    <span className="debrief-summary-meta">
                      {run.status.replaceAll("-", " ")}
                    </span>
                  </summary>
                  {cases.length ? (
                    <ol className="debrief-test-cases">
                      {cases.map((test) => (
                        <li key={test.id}>
                          <div className="debrief-case-heading">
                            <strong>{test.name}</strong>
                            <span
                              className={
                                test.result
                                  ? test.result.passed
                                    ? "passed"
                                    : "failed"
                                  : "debrief-result-missing"
                              }
                            >
                              {test.result
                                ? test.result.passed
                                  ? "Passed"
                                  : "Failed"
                                : "No result recorded"}
                            </span>
                          </div>
                          {test.code !== undefined ? (
                            <pre
                              className="debrief-evidence-code"
                              aria-label={`Assertion source: ${test.name}`}
                            >
                              {test.code}
                            </pre>
                          ) : (
                            <p className="debrief-explanation">
                              Assertion source was not retained.
                            </p>
                          )}
                          {test.result?.error && (
                            <pre className="debrief-evidence-code debrief-test-error">
                              {test.result.error}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="debrief-explanation">
                      No named assertion results in this run.
                    </p>
                  )}
                  <h5>Captured output</h5>
                  {run.output ? (
                    <pre className="debrief-evidence-code">{run.output}</pre>
                  ) : (
                    <p className="debrief-explanation">No output captured.</p>
                  )}
                  {run.message && (
                    <p className="debrief-written-content">{run.message}</p>
                  )}
                </details>
              );
            })}
          </div>
        ) : (
          <p className="debrief-explanation debrief-no-runs">
            No custom test or Python runs were saved with this attempt.
          </p>
        )}
      </details>
      <details className="debrief-disclosure">
        <summary>
          Interview timeline
          <span className="debrief-summary-meta">
            {attempt.runs.length} {attempt.runs.length === 1 ? "run" : "runs"}{" "}
            recorded
          </span>
        </summary>
        <p className="debrief-explanation">
          Times are measured from the start. Phase markers reflect your
          selections; they do not assess your spoken explanation.
        </p>
        <ol className="debrief-timeline">
          <li>
            <time>0m 00s</time>
            <div>
              <strong>
                {attempt.mode === "mock"
                  ? "Interview started"
                  : "Practice started"}
              </strong>
            </div>
          </li>
          {summary.events.map((event, index) => (
            <li key={`${event.at}-${event.kind}-${index}`}>
              <time>{relativeTime(event.at)}</time>
              <div>
                <strong>{event.title}</strong>
                {event.detail && <p>{event.detail}</p>}
                {event.phase && (
                  <span className="debrief-event-context">
                    {
                      INTERVIEW_PHASES.find((phase) => phase.id === event.phase)
                        ?.title
                    }
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </details>
      {attempt.scratchpad ? (
        <ScratchpadSnapshot scratchpad={attempt.scratchpad} />
      ) : (
        <p className="debrief-explanation debrief-no-scratchpad">
          No scratchpad was saved with this submission.
        </p>
      )}
    </section>
  );
}
