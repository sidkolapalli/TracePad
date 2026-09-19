# Tracepad v0.1.0-alpha.1

**Understand it. Build it. Explain it.**

Tracepad's first public alpha is a local Python workspace for learning fundamentals, rehearsing interviews, and making your reasoning visible. This is a source release for individual use on your own computer. It is ready for early feedback, not a claim of interview readiness or a hosted service.

## What you can practice

- **Write and test Python:** Monaco editing, multiple Python modules, named assertions, captured output and tracebacks, multiline input, and the browser-compatible standard library. Stop terminates the worker; each new run starts cleanly.
- **Choose a problem:** Eight original algorithm exercises, a blank sandbox, custom questions/tests, and deterministic local variations across six Python topics. Local topic variations work without AI.
- **Rehearse an interview:** The built-in 60-minute mock starts with a blank editor and no pause/reset. Record clarifying questions and an approach, move through interview stages, and submit for a debrief. Its offline mode introduces a scripted follow-up at 40 minutes or on request; opting into live assistant updates leaves unrevealed follow-ups to that assistant. The clock survives refresh and permits visible overtime.
- **Make reasoning visible:** Write approach and complexity notes, create manual trace tables, and edit flowcharts. Submitted attempts preserve these alongside code/modules, tests, hints, requirements, and selected stage timings.
- **Keep separate projects:** Save independent interview preparations locally, revisit drafts, archive/restore projects, and export/import JSON backups. Light and dark themes and editor preferences are included.
- **Invite an assistant when useful:** Connect an external MCP-compatible assistant for tailored questions, requested hints, attributed feedback, and opt-in live requirements. The app shows incoming changes and records their acknowledgment; the assistant cannot replace your editor code or scratchpads.

See the [feature demos](../README.md#see-it-in-action) and [workspace guide](WORKSPACE_GUIDE.md) for the complete workflow.

## Install and run

Install Node.js 24, then use a terminal:

```sh
git clone --branch v0.1.0-alpha.1 --depth 1 https://github.com/sidkolapalli/TracePad.git
cd TracePad
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** and keep the terminal running. No system Python, separate database, account, API key, or Docker installation is needed. Installation downloads the pinned dependencies once; afterward, core practice works offline through the local server. AI assistance requires an external assistant and its own setup.

Projects save in `.localpad/projects.sqlite` and are not encrypted by Tracepad. Use project export for backups before updating, moving computers, or deleting a checkout. Do not share a personal database or full project backup as an exercise contribution. See [saving and privacy](WORKSPACE_GUIDE.md#saving-and-privacy).

## Verification and known limitations

The [published prerelease record](https://github.com/sidkolapalli/TracePad/releases/tag/v0.1.0-alpha.1) identifies the exact tagged commit, completed Windows/Linux/macOS CI checks, and activated repository safeguards. Publication requires a clean installation, unit tests, browser integration tests, and a production build with offline Pyodide execution on Node.js 24 and Playwright's pinned Chromium. See the [preparation record](ALPHA_CHECKLIST.md#verification-record) for test isolation and audit scope.

- **Early feedback is still needed.** The maintainer is recruiting newcomers for installation and rehearsal testing. Safari and Firefox have not been verified; the GitHub iPhone app's README image rendering also needs confirmation.
- **Local, single-user use only.** There is no collaboration service, host shell, package installer, server-side Python, or autonomous AI interviewer. Keep the server on loopback and run only trusted questions and code; browser workers are not a hardened sandbox for hostile input.
- **Bounded execution.** Runtime initialization may take up to 60 seconds. Execution is limited to 10 seconds per run or entire test suite, with 100 KiB combined output. Input is supplied before execution, not through an interactive terminal. Browser memory limits apply.
- **Reasoning evidence is manual.** Trace tables and flowcharts do not trace Python automatically. Complexity notes do not compute or prove Big-O. Stage durations follow your selected stages and do not measure attention, speech, or communication quality.
- **Results have a defined scope.** Original baseline tests do not assess later follow-up requirements. Your own tests and assistant feedback are separate evidence, and a passing suite is not a readiness score.
- **Saved history is bounded.** The app retains up to 30 attempts and the latest 20 runs per attempt. Export projects regularly if you need a longer record. Backups may contain private interview material, code, notes, and assistant feedback.

## Help shape the next release

Report installation friction, confusing prompts, and reproducible bugs through [GitHub issues](https://github.com/sidkolapalli/TracePad/issues). Include your operating system, browser, version/commit, and synthetic steps to reproduce. Report vulnerabilities through the [private security route](../SECURITY.md).

Contributions use **fork → branch → pull request**; the maintainer reviews and merges into `main`. Start with the [contribution guide](../CONTRIBUTING.md) and [exercise template](EXERCISE_TEMPLATE.md). Tracepad's original code is MIT licensed; bundled dependencies retain their [own notices](../THIRD_PARTY_NOTICES.md).
