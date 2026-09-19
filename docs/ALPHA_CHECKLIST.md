# Early-alpha release checklist

This is the preparation record for `v0.1.0-alpha.1`. Check a gate only after recording its evidence. The [published prerelease](https://github.com/sidkolapalli/TracePad/releases/tag/v0.1.0-alpha.1) is the final publication record: it records the exact tagged commit, completed CI, and live repository safeguards, which cannot be certified in advance by a source commit. Tracepad is an early alpha: automated checks establish specific behavior, while question quality and the newcomer experience still need outside feedback.

## Public-release gates

- [ ] Community contributions use forks and PRs; only the owner can merge to `main`. Both [branch-control rulesets](MAINTAINING.md) are active and verified, required CI checks cannot be bypassed, and `CODEOWNERS` has no errors.
- [x] Repository license, original exercise provenance, and dependency/runtime notices reviewed in source and production output. See the September 19 audit scope below.
- [ ] A working private vulnerability-reporting route is enabled, tested, and linked in [SECURITY.md](../SECURITY.md).
- [x] Publication audit found no personal databases, reusable credentials, exported personal projects, local assistant settings, or private artifacts in the files and branch history intended for publication. See scope and limitations below.
- [ ] Clean installation uses `npm ci` on Node.js 24; the pinned runtime copies successfully without undocumented machine configuration.
- [ ] Unit tests, the production build, browser tests, and offline production checks pass from the release candidate's clean checkout. Record commit and logs below.
- [x] Test servers refuse to reuse occupied ports, and the normal practice database remains unchanged after tests (Windows check below).
- [ ] Windows, Linux, and macOS results are recorded before claiming those platforms as verified. Record browser versions; bundled Chromium coverage does not establish Safari/Firefox support.
- [x] Backup/import, timer refresh recovery, code/module editing, Stop, both themes, keyboard navigation, narrow layout, and review evidence are checked with synthetic data in the local browser suites.
- [ ] Known limitations and any remaining failures are stated in [prerelease notes](RELEASE_NOTES.md). The exact verified commit is tagged `v0.1.0-alpha.1` and published as a GitHub prerelease, with source archives rather than personal databases or test artifacts.

## After publication, before a broad announcement

- [ ] The maintainer invites 3–5 people preparing for interviews to install the alpha and complete a rehearsal without step-by-step help.
- [ ] Record their installation and workflow friction as focused issues, including operating system/browser and synthetic reproductions.
- [ ] Confirm the README's images and demos in the GitHub iPhone app. Desktop and mobile Chromium previews do not establish native-app rendering.

These are planned alpha feedback activities, not completed validation. The maintainer is arranging the first testers.

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

| Candidate / commit | Environment | Result and evidence |
| --- | --- | --- |
| Historical `f8c9242`, September 18, 2026 | Node.js 24; GitHub-hosted Windows, Linux, and macOS; pinned Playwright Chromium | [Completed CI run](https://github.com/sidkolapalli/TracePad/actions/runs/35399169691): clean installation and repository/notice checks passed on all three operating systems, with 169 unit tests, 55 development browser tests, and 40 production browser tests including actual offline Pyodide. |
| Historical local isolation check, September 18, 2026 | Windows build 26200; Node 24.18.0 / npm 11.1.0; Chromium 153.0.8010.12 | Occupied-port and external-URL rejection probes passed. The normal database, WAL, and bridge credential hashes stayed unchanged. Evidence: ignored local `artifacts/test-isolation-evidence.json`. |
| September 19 release preparation | Windows; Node 24.18.0 / npm 11.1.0; Chromium 153.0.8010.12 | 169 unit tests, 56 development browser tests, and 41 production browser tests passed locally, including offline Pyodide and a regression for delayed flowchart focus. Cross-platform clean-checkout CI is a separate release gate. |
| `v0.1.0-alpha.1` release candidate | Exact tagged commit and CI run in the [prerelease record](https://github.com/sidkolapalli/TracePad/releases/tag/v0.1.0-alpha.1) | Publication requires all three matrix jobs to pass. The prerelease records their counts and links; historical results above do not certify the release candidate. |

The September 19 dependency advisory check reported zero known npm vulnerabilities at the time of that check. Notice verification covered 136 production npm packages, emitted Vite/Rolldown helpers, and 13 pinned upstream runtime notice files. A clean scan is not a comprehensive security or license audit.

The September 19 publication review covered all 17 baseline branch-history commits, tracked source and notice files, 14 completed Actions logs and 12 retained artifacts, and synthetic demo fixtures. Gitleaks findings were deterministic test fixtures, migration hashes, or expired loopback development-server tokens; no reusable credential was found. Local assistant checkpoint refs are not publication branches and must never be mirror-pushed. Media review covered every thumbnail, video metadata, and selected MCP setup frames; it was not exhaustive frame-by-frame OCR. Later release-check logs and artifacts are reviewed before publication and recorded in the prerelease. Automated detection cannot guarantee the absence of every secret.

The verification scope is Playwright's pinned Chromium. The matrix does not establish Safari or Firefox support, and automated workflow coverage does not substitute for a newcomer rehearsal. Use [current CI runs](https://github.com/sidkolapalli/TracePad/actions/workflows/ci.yml) to inspect later commits; an in-progress job is not a pass.

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
