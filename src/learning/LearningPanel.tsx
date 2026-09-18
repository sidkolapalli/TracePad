import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Flag,
  Lightbulb,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import type { Attempt, InterviewPhase } from "./types";
import { attemptSummary } from "./state";
import { InterviewJourney } from "./InterviewJourney";
import { InterviewDebrief } from "./InterviewDebrief";
import { RequirementList } from "../InterviewPanel";

export function LearningPanel({
  attempt,
  now,
  busy,
  hintPending,
  onNotes,
  onHint,
  onAIHint,
  onBaseline,
  onFinish,
  onReview,
  onPhase,
  onJourneyNotes,
  onRevealFollowup,
  onCancelHint,
  onOpenTool,
  onAcknowledge,
}: {
  attempt: Attempt;
  now: number;
  busy: boolean;
  hintPending: boolean;
  onNotes: (value: string) => void;
  onHint: () => void;
  onAIHint: () => void;
  onBaseline: () => void;
  onFinish: () => void;
  onReview: () => void;
  onPhase: (phase: InterviewPhase) => void;
  onJourneyNotes: (
    field: "clarifications" | "followupResponse",
    value: string,
  ) => void;
  onRevealFollowup: () => void;
  onCancelHint: () => void;
  onOpenTool: (tool: "brief" | "scratchpad" | "code") => void;
  onAcknowledge: (id: string) => void;
}) {
  const finished = attempt.finishedAt !== null;
  const mock = attempt.mode === "mock";
  const [hintChoice, setHintChoice] = useState<"local" | "ai" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const localHints = attempt.hintsUsed.filter(
    (h) => h.source === "local",
  ).length;
  const phase =
    attempt.interviewJourney?.transitions.at(-1)?.phase ?? "clarify";
  useEffect(() => {
    setHintChoice(null);
    setSubmitting(false);
  }, [attempt.id]);
  useEffect(() => {
    if (submitting) confirmation.current?.focus();
  }, [submitting]);
  const approach = (
    <>
      <label className="approach-label" htmlFor="approach-notes">
        <MessageSquare size={13} /> Approach & clarifying questions
      </label>
      <textarea
        id="approach-notes"
        value={attempt.notes}
        maxLength={6000}
        rows={3}
        disabled={busy}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Explain your object model, the high-level steps, and an edge case before coding."
      />
    </>
  );
  const assistance = (
    <>
      {mock && (
        <p className="learning-help">
          Help is optional and recorded in your debrief. AI hints need an
          external MCP-connected assistant.
        </p>
      )}
      <div className="learning-actions">
        <button
          className="text-button"
          disabled={busy || localHints >= attempt.question.hints.length}
          onClick={() => (mock ? setHintChoice("local") : onHint())}
        >
          <Lightbulb size={14} /> Hint{" "}
          {Math.min(localHints + 1, attempt.question.hints.length)}/
          {attempt.question.hints.length}
        </button>
        <button
          className="text-button"
          disabled={busy || hintPending}
          onClick={() => (mock ? setHintChoice("ai") : onAIHint())}
        >
          <Sparkles size={13} />
          {hintPending ? "AI hint requested" : "Ask AI for a hint"}
        </button>
      </div>
      {hintChoice && (
        <div
          className="mock-hint-confirm"
          role="group"
          aria-label="Confirm interview assistance"
        >
          <p>
            {hintChoice === "local"
              ? "Reveal one progressive hint? This will be recorded as help used."
              : "Request one small nudge from your connected assistant? The timer keeps running."}
          </p>
          <div>
            <button
              className="secondary-button"
              onClick={() => {
                hintChoice === "local" ? onHint() : onAIHint();
                setHintChoice(null);
              }}
            >
              {hintChoice === "local" ? "Reveal hint" : "Request hint"}
            </button>
            <button className="text-button" onClick={() => setHintChoice(null)}>
              Keep trying
            </button>
          </div>
        </div>
      )}
      {hintPending && mock && (
        <p className="learning-help">
          Waiting for your external assistant.{" "}
          <button className="text-button" onClick={onCancelHint}>
            Cancel hint request
          </button>
        </p>
      )}
      {attempt.hintsUsed.length > 0 && (
        <div className="revealed-hints">
          {attempt.hintsUsed.map((hint, i) => (
            <details
              key={`${hint.at}-${i}`}
              open={i === attempt.hintsUsed.length - 1}
            >
              <summary>
                {hint.source === "ai" ? "AI hint" : "Practice hint"} {i + 1}
              </summary>
              <p>{hint.text}</p>
            </details>
          ))}
        </div>
      )}
    </>
  );
  return (
    <div className="learning-panel" id="practice-tools" tabIndex={-1}>
      <div className="learning-mode">
        <BookOpen size={14} />
        <strong>{mock ? "60-minute mock interview" : "Topic practice"}</strong>
        <span>
          {attempt.question.provenance.kind === "ai"
            ? "AI-generated"
            : "Local variation"}
        </span>
      </div>
      {finished ? (
        <div className="attempt-finished">
          <Check size={15} />
          <span>
            Attempt saved. Your review reflects the code you submitted.
          </span>
          <button className="text-button" onClick={onReview}>
            Review <ChevronRight size={13} />
          </button>
        </div>
      ) : (
        <>
          {mock ? (
            <InterviewJourney
              attempt={attempt}
              now={now}
              disabled={busy}
              onPhase={onPhase}
              onNotes={onJourneyNotes}
              onRevealFollowup={onRevealFollowup}
              onOpenTool={onOpenTool}
            />
          ) : (
            <p className="learning-checkpoint">
              {attempt.question.learningObjectives[0]}
            </p>
          )}
          {mock && (
            <RequirementList
              updates={attempt.requirementUpdates ?? []}
              onAcknowledge={onAcknowledge}
            />
          )}
          {mock ? (
            <details className="mock-approach" open={phase === "approach"}>
              <summary>Your approach notes</summary>
              {approach}
            </details>
          ) : (
            approach
          )}
          {mock ? (
            <details className="mock-assistance">
              <summary>
                Assistance · {attempt.hintsUsed.length} hints used
              </summary>
              {assistance}
            </details>
          ) : (
            assistance
          )}
          {submitting ? (
            <div
              className="mock-submit-confirm"
              ref={confirmation}
              tabIndex={-1}
              role="group"
              aria-label="Submit your interview"
            >
              <strong>Ready to submit?</strong>
              <p>
                Your code, modules, notes, and scratchpad will be saved as
                submitted. Original baseline checks run next; they do not score
                follow-up requirements.
              </p>
              <ul>
                <li>
                  {attempt.runs.filter((run) => run.kind !== "baseline").length}{" "}
                  executions recorded before submission
                </li>
                <li>{attempt.hintsUsed.length} hints used</li>
                <li>
                  {
                    (attempt.requirementUpdates ?? []).filter(
                      (update) => update.acknowledgedAt === undefined,
                    ).length
                  }{" "}
                  unacknowledged requirements
                </li>
              </ul>
              <div>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={onFinish}
                >
                  <Flag size={13} />
                  {busy ? "Checking submission…" : "Submit interview"}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setSubmitting(false)}
                >
                  Keep working
                </button>
              </div>
            </div>
          ) : (
            <div className="attempt-controls">
              {!mock && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={onBaseline}
                >
                  Check baseline
                </button>
              )}
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => (mock ? setSubmitting(true) : onFinish())}
              >
                <Flag size={13} /> Finish & review
              </button>
            </div>
          )}
          <p className="learning-help">
            {mock
              ? "Stages record your own progress. Say your reasoning aloud; the app does not record it."
              : "Baseline checks stay fixed. The Tests tab is yours to experiment with."}
          </p>
        </>
      )}
    </div>
  );
}

export function AttemptReview({
  attempt,
  onSelfCheck,
  onRetry,
  onRequestReview,
  reviewPending,
}: {
  attempt: Attempt;
  onSelfCheck: (patch: Partial<Attempt["selfCheck"]>) => void;
  onRetry: () => void;
  onRequestReview: () => void;
  reviewPending: boolean;
}) {
  const summary = attemptSummary(attempt);
  const time = (ms: number) =>
    `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
  return (
    <div className="attempt-review">
      <h3>{attempt.question.title}</h3>
      <div className="review-title">
        <span>
          {attempt.question.provenance.kind === "ai"
            ? `AI · ${attempt.question.provenance.generator}`
            : "Local variation"}
        </span>
      </div>
      <dl className="review-facts">
        <div>
          <dt>Time taken</dt>
          <dd>
            {time(summary.elapsedMs)}
            {summary.elapsedMs > attempt.durationMs && (
              <small> · overtime</small>
            )}
          </dd>
        </div>
        <div>
          <dt>First successful run</dt>
          <dd>
            {summary.firstRunnableMs === null
              ? "Not recorded"
              : time(summary.firstRunnableMs)}
          </dd>
        </div>
        <div>
          <dt>Baseline checks</dt>
          <dd>
            {summary.baseline
              ? `${summary.baseline.passed}/${summary.baseline.total}${summary.baseline.current ? "" : " · needs a fresh check"}`
              : "Not run"}
          </dd>
        </div>
        <div>
          <dt>Help used</dt>
          <dd>
            {summary.hintCount} hints · {summary.pauses} pauses
          </dd>
        </div>
      </dl>
      {attempt.mode === "mock" && <InterviewDebrief attempt={attempt} />}
      <section>
        <h4>What the attempt shows</h4>
        <ul>
          {summary.observations.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>For your next attempt</h4>
        <ul>
          {summary.nextSteps.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Communication self-check</h4>
        <p className="learning-help">
          These are your reflections. No audio is recorded or scored.
        </p>
        <div className="self-checks">
          {(
            [
              ["clarified", "I clarified assumptions and examples"],
              ["explained", "I explained my approach before coding"],
              ["respondedToHints", "I considered and responded to guidance"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={attempt.selfCheck[key]}
                onChange={(e) => onSelfCheck({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </section>
      {attempt.notes && (
        <details>
          <summary>Your approach notes</summary>
          <pre>{attempt.notes}</pre>
        </details>
      )}
      <details>
        <summary>Baseline test evidence</summary>
        {attempt.runs
          .filter((r) => r.kind === "baseline")
          .slice(-1)
          .map((run) => (
            <div key={run.id}>
              {run.results.map((result) => (
                <div className="baseline-result" key={result.id}>
                  <span className={result.passed ? "passed" : "failed"}>
                    {result.passed ? "Passed" : "Failed"}
                  </span>{" "}
                  {result.name}
                  {result.error && <pre>{result.error}</pre>}
                </div>
              ))}
              {run.message && <p>{run.message}</p>}
            </div>
          ))}
      </details>
      <details>
        <summary>Submitted code</summary>
        <h5>main.py</h5>
        <pre>{attempt.source}</pre>
        {Object.entries(attempt.files ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([path, source]) => (
            <div key={path}>
              <h5>{path}</h5>
              <pre>{source}</pre>
            </div>
          ))}
      </details>
      <details>
        <summary>Reference solution — reveal after trying</summary>
        <pre>{attempt.question.referenceSolution}</pre>
      </details>
      <section>
        <h4>AI feedback</h4>
        {attempt.feedback.length === 0 ? (
          <p className="learning-help">
            Connect an assistant, then request a review of your code, notes, and
            test evidence.
          </p>
        ) : (
          attempt.feedback.map((feedback) => (
            <article className="feedback-note" key={feedback.id}>
              <strong>{feedback.reviewer}</strong>
              <p>{feedback.summary}</p>
              <h5>Strengths</h5>
              <ul>
                {feedback.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <h5>Improvements</h5>
              <ul>
                {feedback.improvements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p>
                <strong>Next practice:</strong> {feedback.nextPractice}
              </p>
              <small>
                Evidence:{" "}
                {feedback.evidenceRunIds.length
                  ? feedback.evidenceRunIds.join(", ")
                  : "No execution evidence cited"}
              </small>
            </article>
          ))
        )}
        <button
          className="secondary-button"
          disabled={reviewPending}
          onClick={onRequestReview}
        >
          <Sparkles size={13} />
          {reviewPending ? "Review requested" : "Request AI review"}
        </button>
      </section>
      <div className="review-actions">
        <button className="primary-button" onClick={onRetry}>
          Practice another variation <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
