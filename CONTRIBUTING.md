# Contributing to Tracepad

Tracepad is an early-alpha, local Python interview practice app. Useful contributions include clearer exercises, reproducible bug reports, accessibility improvements, and making a clean installation more reliable. Start with a small change tied to something a learner cannot currently do or understand.

The project lives at [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad). Community contributions use forks and pull requests; repository write access is not needed.

For a suspected vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue. Keep discussions respectful and specific; describe the behavior and its effect on users rather than making assumptions about another contributor.

## Fork and open a pull request

1. Fork the repository to your account and clone your fork.
2. Create a branch for your change: `git switch -c fix/describe-the-change`.
3. Follow the setup and validation instructions below, then push the branch to your fork.
4. Open a pull request against `sidkolapalli/TracePad:main`. Explain the behavior change and test results, then respond to review feedback.

`@sidkolapalli` reviews and merges contributions. Contributors do not push or merge into the upstream `main` branch, and an approved PR does not grant merge permission. Changes to code, documentation, exercises, and CI all follow this workflow.

Maintainers should follow [the branch-control setup and verification guide](docs/MAINTAINING.md). That guide records whether the prepared GitHub protections have actually been activated; a policy document or `CODEOWNERS` file alone does not enforce them.

## Set up a checkout

Use Node.js 24 and npm. A separate system Python or database installation is not required.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. Installation needs internet access to download packages; the postinstall script copies the pinned Pyodide runtime locally. Keep the server running while practicing. See the [installation notes](docs/DEVELOPMENT.md#installation-notes) for platform and offline-use details, and the [workspace guide](docs/WORKSPACE_GUIDE.md#saving-and-privacy) for saving and backup behavior.

Use synthetic practice data when developing. Never include `.localpad/`, exported personal projects, bridge tokens, employer questions, local assistant settings, or screenshots containing private code in a contribution. The application database and test databases are local artifacts, not source fixtures.

## Understand the relevant boundary

| Area                                   | Main files                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Fixed library exercises                | `src/exercises.ts`, `src/types.ts`, `tests/solutions.ts`                                |
| Topic variations and mock question     | `src/learning/curriculum.ts`, `src/learning/curriculum.test.ts`                         |
| Interview stages and recorded evidence | `src/learning/journey.ts`, `src/learning/state.ts`, `src/learning/InterviewDebrief.tsx` |
| Python execution and module files      | `src/python.worker.ts`, `src/runner.ts`, `src/files.ts`                                 |
| Visual reasoning                       | `src/scratchpad/`                                                                       |
| Projects and persistence               | `src/projects/`, `server/projects.ts`                                                   |
| Assistant contracts and consent        | `server/contracts.ts`, `server/bridge.ts`, `server/mcp.ts`, `docs/MCP.md`               |

Keep submitted evidence separate from editable drafts, preserve older saved documents, and validate new data at its boundary. An assistant must not silently alter source or scratchpads. A passing baseline is evidence about those assertions, not an interview-readiness score. Stage timings are self-selected wall-clock intervals, not observed attention or speech.

Public branding is **Tracepad**. Existing `.localpad/` paths, `localpad.*` storage keys, `LOCALPAD_*` environment variables, `localpad://` resources, `/api/localpad` routes, and the `X-Localpad` header remain compatibility contracts. Do not rename them as a cosmetic change; a protocol or persistence migration needs its own design and tests.

## Add or improve an exercise

Copy [the exercise contribution template](docs/EXERCISE_TEMPLATE.md) into your pull request or working notes. This is an authoring checklist; a portable question-pack importer is not shipped yet.

1. Describe one learning objective and a precise Python contract: names, parameters, return values, error behavior, mutation, and relevant edge cases. Keep the prompt, examples, starter, and tests consistent. Use original content or identify its source and redistribution permission.
2. For a library question, add a stable ID and `Exercise` entry in `src/exercises.ts`. Add its correct implementation and a representative incorrect implementation to the existing maps in `tests/solutions.ts`. Extend `tests/runtime.spec.ts` with further targeted incorrect variants rather than overwriting the same map entry. Its parameterized cases execute the library through real browser Pyodide.
3. For a generated topic variation, update `src/learning/curriculum.ts`. Preserve deterministic seeds and honest `local-template` provenance. Extend `src/learning/curriculum.test.ts` with reference, starter, and targeted mutation checks for every new branch and level. These tests use the installed Pyodide runtime, not system Python. Adding a topic also needs the versioned MCP schema and documented topic list updated consistently.
4. Write independent, named assertions for normal behavior, boundaries, invalid input where specified, and mutable state or object identity where relevant. Assertions must accept alternative correct implementations. Do not require a private attribute, an exact algorithm, or exact error wording unless the public contract requires it. Avoid network access, timing-dependent assertions, large output, and external packages.
5. Prove the reference passes and realistic mistakes fail. Include at least two targeted mistakes in the contribution, such as shared class state, an off-by-one boundary, returning internal mutable storage, or losing object identity. A `pass` starter failing alone is not enough. If a defect is deliberately out of scope, say so.
6. Try the question as a learner, including one incorrect submission. Check that failures are informative and hints progress from a useful direction to a more explicit idea without exposing the reference immediately.

Keep existing exercise IDs stable so saved drafts remain associated with the same contract. Discuss a changed contract or baseline before replacing it under an existing ID; a new ID is often appropriate. Existing submitted attempts retain their question and evidence snapshots.

## Validate a change

Use the commands in the [development guide: Build and verify](docs/DEVELOPMENT.md#build-and-verify). The full release check includes unit/schema tests, real browser Python tests, a production build, and an offline production rehearsal. Tests must use their managed, isolated servers and databases; do not point them at a personal practice server.

For an exercise-only change, the relevant minimum is:

```sh
npm test
npm run test:e2e -- tests/runtime.spec.ts
npm run build
```

For an interview-flow change, also run `tests/interview-journey.spec.ts` and the production checks. For persistence or MCP changes, run the relevant project/bridge tests. UI changes need keyboard checks and both themes at desktop and narrow widths. Prefer a test of the user-visible failure over a test that repeats the implementation.

## Submit a focused change

Explain the problem, the resulting behavior, and the checks you actually ran. Include any failing or unrun checks rather than implying a complete pass. Screenshots should show the relevant change with synthetic data. State content provenance, migration effects, and limitations when applicable.

Do not submit generated build/runtime files, local databases, test reports, or credentials. Do not run community-submitted code with deployment secrets. CI checks support human review; they do not establish exercise quality or make unknown Python safe to execute.
