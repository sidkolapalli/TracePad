# Early-alpha release checklist

This is a release preparation record, not a claim that a release has shipped. Check a gate only after recording its evidence. Tracepad should be introduced as an early alpha with one complete local mock interview; its question quality and newcomer experience still need outside feedback.

## Public-release gates

- [ ] Maintainer has reviewed the repository license, original exercise provenance, and dependency/runtime notices in both source and production output.
- [ ] A working private vulnerability-reporting route is enabled, tested, and linked in [SECURITY.md](../SECURITY.md).
- [ ] The exact files and Git history intended for publication contain no `.localpad/`, credentials, exported personal projects, local assistant settings, or private artifacts.
- [ ] Clean installation uses `npm ci` on Node.js 24; the pinned runtime copies successfully without undocumented machine configuration.
- [ ] Unit tests, the production build, browser tests, and offline production checks pass from the release candidate's clean checkout. Record commit and logs below.
- [x] Test servers refuse to reuse occupied ports, and the normal practice database remains unchanged after tests (Windows check below).
- [ ] Windows, Linux, and macOS results are recorded before claiming those platforms as verified. Record browser versions; bundled Chromium coverage does not establish Safari/Firefox support.
- [ ] A newcomer finishes a rehearsal without step-by-step assistance from its author.
- [ ] Backup/import, timer refresh recovery, code/module editing, Stop, both themes, keyboard navigation, narrow layout, and review evidence are checked with synthetic data.
- [ ] Known limitations and any remaining failures are stated in prerelease notes. Maintainer chooses the tag, release assets, and announcement for [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad) explicitly.

## Reproducible verification

From a clean checkout with Node.js 24:

```sh
npm ci
npx playwright install chromium
npm run check:repo
npm run notices:check
npm test
npm run build
npm run test:e2e
npm run test:e2e:production
```

Linux CI should use `npx playwright install --with-deps chromium`. Browser installation is a one-time download per Playwright version and is only needed for tests. The app itself runs in the user's browser. The production test command builds again so it cannot silently use stale output.

The browser commands own their servers: development tests use `127.0.0.1:56173`, and production checks use `127.0.0.1:54173`. Each invocation creates its own `.localpad/playwright/<UUID>/` database and bridge credential. An occupied test port causes a failure, not reuse of the existing process. Do not override the URL to a personal development/preview server. Retained test directories and reports are local inspection artifacts, not release assets.

The production check starts from `dist`, blocks non-local requests in a fresh browser context, and executes real Pyodide. It establishes offline app loading after installation; it does not claim that dependency installation works offline or that user-written Python has its network access blocked.

### Verification record

| Candidate / commit                                     | OS and version      | Node/npm                  | Browser                           | Commands and result                                                                                             | Evidence / unresolved issue                                                                                                             |
| ------------------------------------------------------ | ------------------- | ------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0-alpha.1 working tree, 2026-09-18 (not committed) | Windows build 26200 | Node 24.18.0 / npm 11.1.0 | Playwright Chromium 153.0.8010.12 | 164 unit tests; 35 production browser tests; repository and notice checks passed                                | GitHub CI, Linux/macOS, and newcomer rehearsal remain pending.                                                                          |
| Same candidate, fresh dependency installation          | Windows build 26200 | Node 24.18.0 / npm 11.1.0 | Same pinned Chromium              | `npm ci`, runtime preparation, production build, offline runtime, theme/layout, and complete mock checks passed | Used documented system certificate trust for this network; TLS verification stayed enabled. Focus regression resolution recorded below. |

The initial development suite passed 49 of 50 cases; a Vite reload caused by the temporary clean checkout interrupted the remaining module case. Test servers now disable file watching/HMR, and normal development ignores `.localpad/**`. All six module/isolation checks passed afterward. The occupied-port and external-URL rejection probes passed; hashes of the normal database, WAL, and bridge credential remained unchanged. Local evidence is in ignored `artifacts/test-isolation-evidence.json`.

The clean-install mock check exposed a focus race: dismissing Practice could restore focus after the user had already entered the editor. Focus restoration now respects a newly focused control. The browser test also waits for file creation and review dismissal to finish before typing. The complete mock passed from the clean installed production checkout; the related practice keyboard checks passed.

After the Tracepad identity and console changes, four targeted production browser checks passed: raw stdout/stderr, exact copy and clipboard failure, display-only clearing with unchanged saved evidence, theme persistence, desktop/narrow navigation, and offline Python execution. Batched visual captures cover the console in desktop light/dark and 320px light layouts. These checks use synthetic projects in isolated test databases.

The dependency advisory check reported zero known npm vulnerabilities on this date. Notice verification covers 134 production npm packages, Vite/Rolldown emitted helpers, and 13 pinned upstream runtime notice files. These results do not replace review of a final committed release candidate.

Do not mark an operating system verified just because a CI matrix includes it. Record a completed run and its result.

## First rehearsal walkthrough

Use a new project with synthetic interview details. For a short demonstration, the follow-up can be revealed early and the attempt submitted early; label it as a demonstration, not a completed 60-minute rehearsal. Do not change the computer clock to accelerate the app.

1. **Install and open:** Follow the README's `npm ci` / `npm run dev` instructions. Open `http://127.0.0.1:5173/`, create an **Alpha rehearsal** project, and confirm **Saved locally**.
2. **Start:** Open **Practice → 60-minute mock interview → Start 60-minute mock**. Confirm the blank editor, running 60-minute clock, and lack of pause/reset. Read the public problem contract in **Brief**.
3. **Clarify:** In **Interview**, record a question and the assumption you will use. Select **Approach**, explain your plan aloud, and write the key idea. The app records text and stage selections, not speech.
4. **Reason visually:** In **Scratchpad**, record two state changes in a trace table and create a short flowchart with a labelled decision. Return to **Interview** and select **Code & test**.
5. **Implement and test:** Create a module in **Files**, import it from `main.py`, and run a small example. Write at least one named scratch assertion in **Tests**. Make one deliberate mistake and read the failure before fixing it. Confirm files and scratchpad survive a refresh while the timer continues.
6. **Handle a change:** At 40 elapsed minutes, the local mock reveals **Follow-up: borrower view**. For a short demo, select **Follow-up → Reveal follow-up**. Acknowledge it, explain the effect on your approach, and add a test for the new behavior. Leave live assistant updates off for this offline demonstration.
7. **Control assistance:** Optionally open **Assistance** and deliberately reveal one hint. Confirm it is counted. If no hint is needed, keep going; assistance is not a required step.
8. **Submit:** Select **Wrap up**, consider edge cases, then **Finish & review → Submit interview**. Read the original baseline result and your own test evidence separately. A baseline pass alone does not certify the added follow-up.
9. **Review:** Find stage timing, the requirement and acknowledgment, any hint, submitted code/modules, and the trace table/flowchart. Edit a working note afterward and reopen History to confirm the submitted evidence remains unchanged.
10. **Keep the work:** Export the project, import that backup as a separate project, and confirm the saved attempt and scratchpad are present. A full backup may contain personal information; use synthetic data for anything shared publicly.

For a full rehearsal, use the entire 60-minute budget, talk through your reasoning, and let the follow-up arrive naturally. The timer permits overtime, which should remain visible in the review.

## Newcomer feedback record

Ask testers for observations, not a rating alone:

- At what step did you stop knowing what to do next?
- Did a hint or requirement arrive when and where you expected?
- Could you recover from an error without losing work?
- What did the debrief tell you to practice next? What evidence was missing?
- What OS/browser did you use, and did installation require undocumented help?

With their permission, record the issue and reproduction using synthetic data. A few successful rehearsals support an alpha announcement; they do not establish broad interview outcomes or universal accessibility.
