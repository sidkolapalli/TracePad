# Tracepad community roadmap

Updated September 18, 2026. Tracepad is an early-alpha, open-source practice app intended to run on one person's computer. The immediate milestone is a reliable first rehearsal for a new user, followed by feedback from a small group preparing for interviews.

Project: [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad). **Understand it. Build it. Explain it.** Interview practice sits within the broader aim of learning fundamentals and reasoning through problems locally, with optional AI guidance.

## Available in the current implementation

- A local Python workspace with a pinned Pyodide runtime, Monaco editor, light/dark themes, standard-library execution, named tests, supplied stdin, and bounded disposable workers.
- Multiple saved interview projects, independent drafts, a Python module explorer, rename/delete controls, and normal imports from the `main.py` entry point.
- SQLite saving with revisions and conflict detection, recovery handling, archive/restore, and versioned project export/import. Import creates a separate project; it does not merge or replace an existing one.
- Eight original algorithm exercises, custom questions, twelve local variation families across six topics, and an integrated OOP mock. Local variations are deterministic templates, not AI-generated questions.
- A strict 60-minute mock with a blank editor, manually selected stages, clarifying and approach notes, controlled hints, a scripted follow-up, submission, and review.
- Manual trace tables and editable flowcharts, saved per question and retained with submitted evidence. Flowcharts export as SVG; scratchpads export as JSON. There is no automatic execution trace or collaborative whiteboard.
- A debrief with selected phase durations, hint and requirement history, test evidence, submitted source/modules, and visual reasoning. Later working edits do not rewrite a submission. There is no keystroke playback, audio assessment, or automated readiness score.
- Optional MCP coaching through an external assistant: question validation, requested hints, attributed feedback, read-only structured snapshots, and opt-in live requirements. There is no autonomous interviewer inside the app.

See the [README](../README.md) for operating instructions and current limits. The [alpha checklist](ALPHA_CHECKLIST.md) distinguishes implemented tooling from release checks that still require evidence.

## Before a public alpha announcement

1. Run the lockfile-based installation, unit tests, production build, actual browser Python checks, and offline production rehearsal from clean checkouts. The test harness owns isolated servers and local databases; it must not reuse a learner's running server.
2. Review the repository license and dependency notices against the files that will actually ship. Keep runtime attribution in distributed builds. Check content provenance for every exercise and reference.
3. Establish and test a private security reporting route. A guide without a reachable private destination does not satisfy this gate. See [SECURITY.md](../SECURITY.md).
4. Review the exact public file list. Exclude personal SQLite databases, bridge credentials, backups, test artifacts, local assistant configuration, and private screenshots. No automatic publication or Git history rewrite is part of preparation.
5. Have a newcomer complete the [first rehearsal walkthrough](ALPHA_CHECKLIST.md#first-rehearsal-walkthrough) without live help. Ask what was confusing, whether the follow-up was visible, and whether the review helped them choose what to practice next.
6. Record actual operating-system/browser results and known issues. CI configuration alone is not evidence of a passing clean-machine run. Publish a clearly labelled prerelease only after these checks are reviewed.

[CONTRIBUTING.md](../CONTRIBUTING.md), the [exercise contribution template](EXERCISE_TEMPLATE.md), and issue/PR templates are the initial contribution path. Community content still arrives through source changes and human review.

## Next, driven by learner feedback

| Candidate improvement                 | Useful outcome                                                                | Evidence before building                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Better question coverage and wording  | Learners practice distinct concepts with dependable edge-case tests           | Repeated confusion or a demonstrated gap in the current catalog                             |
| Curated topic paths and a retry queue | Learners revisit weak areas without mistaking one pass for mastery            | Newcomers cannot choose an appropriate next exercise                                        |
| Portable, attributed question packs   | Contributors exchange questions without editing React/TypeScript              | A reviewed schema, provenance/license policy, compatibility rules, and safe import workflow |
| Selective review export               | A learner shares chosen evidence without disclosing an entire private project | Clear selection and redaction needs from peer review                                        |
| Run-to-run comparison                 | A learner sees the meaningful change between failing and passing code         | Existing recorded evidence is difficult to compare                                          |
| Keyboard/screen-reader refinements    | More learners can finish the same rehearsal independently                     | Observed accessibility failures in actual workflows                                         |
| Editor assistance presets             | A learner deliberately matches an interview's permitted assistance            | Clear requirements from interviews, rather than a larger settings menu                      |

Portable packs are not implemented. A proposed pack should include identity/version, author/source/license metadata, compatibility, topic, prompt, examples, constraints, starter, named tests, hints, reference, and objectives. Metadata inspection must precede any explicit execution of supplied references or tests. Successful reference validation means agreement with those assertions; it is not a safety or quality certification.

Full project backups already exist and may contain private notes and code. They are not a substitute for shareable question packs or redacted review bundles. Current history keeps at most 30 attempts and the latest 20 runs per attempt; export regularly if you need records beyond those limits.

## Outside the first local release

Hosted accounts, leaderboards, proctoring, employer integrations, live matchmaking, real-time collaboration, unrestricted package installation, and broad multi-language support are outside this release. A separate connectivity, consent, and security design would be needed before adding shared sessions or remote hosting.

The earlier feature survey referenced official documentation for [CoderPad interview tools](https://coderpad.io/resources/docs/interview/), [HackerRank interview workspaces](https://support.hackerrank.com/articles/7917691813-introduction-to-interview), [Exercism tracks](https://exercism.org/docs/building/tracks), and [Codewars test guidelines](https://docs.codewars.com/authoring/guidelines/submission-tests/). Those are background references, not parity claims or a substitute for testing Tracepad with learners.
