# Tracepad development guide

Installation notes, build and test commands, runtime limits, and a map of the source. See the [README](../README.md) for an overview and the [workspace guide](WORKSPACE_GUIDE.md) for operating instructions.

[Installation notes](#installation-notes) · [Build and verify](#build-and-verify) · [Runtime limits](#runtime-limits) · [Project structure](#project-structure)

## Installation notes

Use Node.js 24 and npm. Clone [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad) and install from its directory:

```sh
git clone https://github.com/sidkolapalli/TracePad.git
cd TracePad
npm ci
npm run dev
```

If you already have this checkout, start with `npm ci` in its current directory; renaming the folder is unnecessary.

Open **http://127.0.0.1:5173/**. Leave the terminal running while practicing. Stop the server with Ctrl+C.

On Windows, if your npm configuration overrides the platform to Linux, install with `npm ci --os=win32 --cpu=x64 --include=optional` instead. If your network uses certificates installed in the Windows certificate store, Node.js 24 supports `--use-system-ca`; keep certificate verification enabled.

Installation downloads dependencies once. The postinstall script copies the pinned Python runtime into `public/python/`; all runtime and editor files are served locally. After installation, the app needs the local server but no internet connection. No external fonts, CDNs, accounts, or code-execution services are used.

No system Python, separate database, or Docker installation is needed. CI is configured for Node.js 24 on Windows, Linux, and macOS; that configuration is not a claim that hosted CI has already run. Current browser automation targets the Playwright-pinned Chromium build. Other browsers need verification before claiming support.

## Build and verify

Build and run the production app:

```sh
npm run build
npm run preview
```

The preview serves the production build at **http://127.0.0.1:4173/**. Core Python assets are included in `dist/python/`.

For development and release checks, install Playwright's pinned Chromium once, then run:

```sh
npx playwright install chromium
npm run check:repo
npm run notices:check
npm test
npm run test:e2e
npm run test:e2e:production
```

Linux CI uses `npx playwright install --with-deps chromium` for browser system dependencies. An installed Google Chrome is not required. `test:e2e:production` builds first, then runs the production checks. The CI matrix runs the same kinds of checks; record completed results in the [alpha checklist](ALPHA_CHECKLIST.md).

Browser tests start their own servers on **127.0.0.1:56173** (development) or **127.0.0.1:54173** (production). Each invocation gets a new database and bridge token under **`.localpad/playwright/<UUID>/`**. Tests refuse to reuse an existing server and fail if their port is occupied. Personal practice servers on 5173/4173 can remain running. Do not supply the old `LOCALPAD_PRODUCTION_URL` override or manually direct tests to a personal server. Test directories and reports are retained locally for inspection and ignored by Git.

Tests cover project isolation, legacy migration, save conflicts, archive/restore, backups, timers, immutable assessment evidence, worker lifecycle, curriculum branches against real Pyodide, and the actual MCP SDK transport. Browser checks exercise code/modules, custom questions, the complete mock, trace tables/flowcharts, refresh recovery, cancellation, limits, AI question validation, hints, and feedback. Algorithm references remain in test-only code; learning references are bundled for offline validation and post-attempt review.

The production offline test uses a fresh browser context and blocks non-local requests while loading Monaco and executing Python. This verifies app operation after installation without internet access; it does not establish a network security boundary for arbitrary user-written Python.

`check:repo` scans publication candidates for prohibited local/generated files, selected credential patterns, and required release metadata. It helps catch common mistakes; it is not a comprehensive secret or legal audit. `notices:check` verifies the generated dependency notice files match the installed lockfile inputs. Follow [the release checklist](ALPHA_CHECKLIST.md) before announcing a prerelease.

## Runtime limits

There is no server-side Python execution, shell, package installer, or direct access to your installed Python environment. The runtime supports browser-compatible Python standard-library modules. This is a personal practice environment, not a security boundary for executing hostile third-party code. Each run has a new interpreter. Each test restores submitted project files and resets project imports, globals, and input; standard-library state is shared within a suite. Runtime initialization has a 60-second limit; execution has a 10-second limit per run or entire test suite. Combined output is capped at 100 KiB. Browser memory limits still apply.

See the [workspace guide](WORKSPACE_GUIDE.md#saving-and-privacy) for saved-history bounds, project backups, and recovery behavior.

## Project structure

- `src/projects/`, `src/studio.css`: project navigation, backup/recovery, and the project-oriented interface.
- `server/projects.ts`: local SQLite schema, atomic persistence, and loopback project API.
- `src/App.tsx`, `src/styles.css`, `src/CodeEditor.tsx`: the workspace and Monaco integration.
- `src/runner.ts`, `src/python.worker.ts`: typed worker lifecycle and Python execution.
- `src/exercises.ts`, `src/session.ts`, `src/types.ts`: exercise content, storage, timers, and shared contracts.
- `src/learning/`: topic curriculum, practice state, evidence reviews, and assistant connection UI.
- `server/`: versioned Zod contracts, the loopback bridge, and the MCP stdio server.
- `scripts/copy-runtime.mjs`: local Python asset preparation.
- `tests/`: real-browser execution and workflow tests.

`npm ci` regenerates the ignored runtime assets. If dependencies were installed with scripts disabled, run `node scripts/copy-runtime.mjs` before starting or building.
