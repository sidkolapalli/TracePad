import { ArrowRight, BookOpen, PencilRuler } from "lucide-react";
import { INTERVIEW_PHASES } from "./journey";
import type { Attempt, InterviewPhase } from "./types";

export function InterviewJourney({
  attempt,
  now,
  disabled,
  onPhase,
  onNotes,
  onRevealFollowup,
  onOpenTool,
}: {
  attempt: Attempt;
  now: number;
  disabled: boolean;
  onPhase: (phase: InterviewPhase) => void;
  onNotes: (
    field: "clarifications" | "followupResponse",
    value: string,
  ) => void;
  onRevealFollowup: () => void;
  onOpenTool: (tool: "brief" | "scratchpad" | "code") => void;
}) {
  const current =
    attempt.interviewJourney?.transitions.at(-1)?.phase ?? "clarify";
  const index = INTERVIEW_PHASES.findIndex((phase) => phase.id === current);
  const phase = INTERVIEW_PHASES[index];
  const minutes = Math.max(0, (now - attempt.startedAt) / 60000);
  const suggested =
    INTERVIEW_PHASES.find((item) => minutes < item.toMinute) ??
    INTERVIEW_PHASES.at(-1)!;
  const localFollowup =
    attempt.question.provenance.kind === "local-template" &&
    attempt.question.provenance.templateId === "mock.equipment-library.v1" &&
    !attempt.liveInterviewer;
  const delivered = (attempt.requirementUpdates?.length ?? 0) > 0;
  return (
    <section className="mock-journey" aria-label="Interview stages">
      <nav className="journey-stages" aria-label="Choose your interview stage">
        {INTERVIEW_PHASES.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-current={current === item.id ? "step" : undefined}
            aria-label={item.title}
            disabled={disabled}
            onClick={() => onPhase(item.id)}
          >
            <span aria-hidden="true">{i + 1}</span>
            {item.title}
          </button>
        ))}
      </nav>
      <div className="journey-focus">
        <div className="journey-heading">
          <h3>{phase.title}</h3>
          <span>
            {phase.fromMinute}–{phase.toMinute} min
          </span>
        </div>
        <p>{phase.prompt}</p>
        <p className="journey-pace" role="status">
          {minutes >= 60
            ? "Time’s up. Wrap up or continue into overtime; submit when ready."
            : `Pacing guide: ${suggested.title.toLowerCase()}. You choose when to move on.`}
        </p>
        {current === "clarify" && (
          <>
            <button className="text-button" onClick={() => onOpenTool("brief")}>
              <BookOpen size={14} />
              Read the problem
            </button>
            <label htmlFor="mock-clarifications">
              Clarifying questions & assumptions
            </label>
            <textarea
              id="mock-clarifications"
              rows={3}
              maxLength={6000}
              value={attempt.interviewJourney?.clarifications ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onNotes("clarifications", event.target.value)
              }
              placeholder="What are the inputs? Which boundaries or assumptions should you confirm?"
            />
          </>
        )}
        {(current === "approach" || current === "code") && (
          <div className="journey-tools">
            <button
              className="text-button"
              onClick={() => onOpenTool("scratchpad")}
            >
              <PencilRuler size={14} />
              Open scratchpad
            </button>
            {current === "code" && (
              <button
                className="text-button"
                onClick={() => onOpenTool("code")}
              >
                Focus code <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
        {current === "followup" && (
          <>
            {!delivered && (
              <p className="learning-help">
                {localFollowup
                  ? "The local interview script adds a requirement at 40 minutes. Reveal it now if you are ready."
                  : "Your connected assistant supplies follow-ups when live updates are enabled. You can keep practicing while you wait."}
              </p>
            )}
            {localFollowup &&
              !(attempt.requirementUpdates ?? []).some(
                (update) => update.author === "Local interview script",
              ) && (
                <button
                  className="secondary-button"
                  disabled={disabled}
                  onClick={onRevealFollowup}
                >
                  Reveal follow-up
                </button>
              )}
            <label htmlFor="mock-followup-response">
              Follow-up response & tradeoffs
            </label>
            <textarea
              id="mock-followup-response"
              rows={3}
              maxLength={6000}
              value={attempt.interviewJourney?.followupResponse ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onNotes("followupResponse", event.target.value)
              }
              placeholder="What changes? What can stay? Which test proves the new behavior?"
            />
          </>
        )}
        {current === "wrapup" && (
          <ul className="journey-wrapup">
            <li>Run an ordinary case and an edge case.</li>
            <li>Explain complexity and a remaining tradeoff.</li>
            <li>Check every follow-up before submitting.</li>
          </ul>
        )}
        {index < INTERVIEW_PHASES.length - 1 && (
          <button
            className="secondary-button journey-next"
            disabled={disabled}
            onClick={() => onPhase(INTERVIEW_PHASES[index + 1].id)}
          >
            Continue to {INTERVIEW_PHASES[index + 1].title.toLowerCase()}{" "}
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </section>
  );
}
