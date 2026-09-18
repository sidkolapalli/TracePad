# Tracepad

**Understand it. Build it. Explain it.**

A local coding workspace for learning fundamentals, practicing interviews, and working through problems—with AI guidance when you choose.

The current Python workspace includes Monaco, topic drills, 60-minute mock interviews, eight original algorithm exercises, custom questions, separate interview projects, and automatic local SQLite saving. Python runs in a disposable browser worker through a pinned, locally served Pyodide runtime. An optional MCP connection lets an external assistant provide new questions, requested hints, and reviews.

**Early alpha · 0.1.0-alpha.1.** The core rehearsal is implemented; installation reliability and the newcomer experience still need wider testing. This is a source checkout for local practice, not a hosted service. AI participation requires your own external MCP-connected assistant. The app does not evaluate speech or predict interview outcomes.

Start with the [first rehearsal walkthrough](docs/ALPHA_CHECKLIST.md#first-rehearsal-walkthrough). See the [community roadmap](docs/COMMUNITY_ROADMAP.md) for what is implemented and what remains, [CONTRIBUTING.md](CONTRIBUTING.md) for code and exercise contributions, and [SECURITY.md](SECURITY.md) for trust boundaries and the private-reporting release gate.

## Start

Use Node.js 24 and npm. The project repository is [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad), currently private. Once you have access to a source checkout there, clone it and install from its directory:

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

## Practice

- Open **Practice** in the header for focused **15/20-minute drills**. Choose foundation or applied questions on classes and instance state, validation, composition, polymorphism, collections, or debugging. Offline generation varies twelve exercise families; it is labelled **Local variation**, not AI generation. Each question's reference solution must pass its baseline checks in Python before practice starts.
- Choose **60-minute mock** for an integrated OOP exercise with a blank editor. The interview follows **Clarify → Approach → Code & test → Follow-up → Wrap up → Submit → Review**. Select each stage when you reach it; suggested time windows guide pacing without locking tools. The timer starts with the attempt, survives refresh, and cannot be paused or reset during a mock. Expiration allows overtime. Explain your reasoning aloud; the app does not record audio.
- During an attempt, save approach notes, request progressive hints, and write scratch tests in **Tests**. **Check baseline** uses the original fixed tests in drills. In mocks, those checks run at **Finish & review**. Editing scratch tests cannot change baseline results. Finishing saves submitted code and evidence; later editor changes do not rewrite that review. Switching to a different question asks to finish and preserve the attempt. Switching projects saves it without finishing; its clock continues.
- **History** shows completed attempts and observed results, including time, hints, pauses, and test evidence. Communication checkboxes are self-assessments. Reference solutions are available inside completed reviews. **Practice another variation** starts a fresh attempt.
- Use the sidebar's **Brief**, **Files**, **Scratchpad**, and **Interview** tabs to move between the question, your project, visual reasoning, and interview notes/activity. Collapse the sidebar to an icon rail when you need more editor space. In **Brief**, open **Change question** to choose an exercise or the blank sandbox.
- In **Files**, create Python modules such as `models.py` or `utils/formatting.py`. Folders follow the path you enter; packages can include `__init__.py`. Import them normally from `main.py`. Rename and delete modules from the explorer; update your imports when renaming. The fixed entry point `main.py` cannot be renamed or deleted. Each question keeps its own files, and each editor tab has its own undo history. Each question allows 32 additional Python files and up to 1 MiB of combined source for execution.
- The **Explorer** uses a collapsible folder tree. **New file** starts in the focused folder; enter a full relative path to place it elsewhere. **F2** renames inline, **Enter** saves, and **Escape** cancels. Arrow keys navigate folders, and **Collapse folders** folds the tree. Hover or select a module for its rename/delete actions. Editor tabs show short filenames with full paths in their tooltips.
- **Run** executes `main.py`. **Ctrl+Enter** (Cmd+Enter on macOS) runs from the editor. Use **Stop** to terminate execution immediately.
- **Console** preserves output spacing and distinguishes standard error. **Copy** copies the displayed output; **Clear** hides it without deleting test results or saved interview evidence. Output follows new lines unless you scroll up. The console is an output viewer; supply input in the **Input** tab before running.
- **Run tests** checks every named assertion against a fresh solution namespace. With no cases, **Add tests** takes you to the Tests pane. Expand a result to inspect its assertion, edit it, or see a traceback. Add or delete cases to explore edge conditions; **Undo** restores deleted tests during the current question session, including their names and assertions. Editing code, input, or tests clears prior test results and cancels an active run.
- Supply multiline text in **Input** before running. Read it with `input()` or `sys.stdin.read()`. Input is replayed independently for each test; exhausted input raises Python's normal EOF error.
- **New question** accepts your title, prompt, starter code, and optional named assertion snippets. Each test can contain several assertions, such as `assert solve([1, 2]) == 3`. The pencil edits custom questions; the trash button deletes them after confirmation. Editing starter code does not overwrite your existing solution; **Reset code** applies the starter.
- Outside topic practice, the **45-minute timer** starts only when you press Play. Choose 30/45/60 minutes or 1–180 custom minutes. The timer follows the session across library questions, survives refresh, and continues into overtime. Drills allow pauses, recorded in the review; elapsed review time includes those pauses.
- Drag either panel divider, or focus it and use the arrow keys. Open **Editor options** beside Run for font size, **Reset code**, and focus mode. Collapse the console with its chevron; running code expands it again. On narrow screens, one row switches between **Brief**, **Files**, **Code**, **Scratchpad**, and **Interview**.
- Use the **sun/moon button** in the header to switch between light and dark mode. Your choice is saved in the active interview project and applies to the editor, workspace, and practice dialogs. Existing sessions keep dark mode until you switch.

## A complete mock interview

Start with **Practice → 60-minute mock interview → Start 60-minute mock**. In **Interview**, use **Read the problem**, record clarifying questions and assumptions, then select **Approach** to explain your plan. **Open scratchpad** takes you to trace tables and flowcharts; code and modules remain available throughout. Stage selections record your own progress, including revisits and time away from the tab. They do not detect speech, typing, or attention.

The offline equipment-lending mock delivers **Follow-up: borrower view** at 40 minutes, or earlier with **Reveal follow-up** in the Follow-up stage. This is labelled **Local interview script**. It asks for a borrower-specific view of active loans; explain the change, acknowledge it, and write a test. The follow-up is delivered once and survives refresh. Enabling **Allow live interview updates** leaves unrevealed follow-ups to your external assistant instead; AI questions do not get the local script.

**Assistance** is optional. A mock requires a deliberate **Reveal hint** or **Request hint** action, and received hints are timestamped in the debrief. Pending AI requests can be cancelled. There is no autonomous AI interviewer inside Tracepad.

**Finish & review** opens a submission checkpoint; **Submit interview** runs the original baseline and saves the attempt. The review shows selected phase durations, the timing and contents of hints and requirement changes, a chronological event log, and the submitted code, modules, notes, trace table, and flowchart outline. Later working edits cannot rewrite these submitted records. Original baseline scores do not assess follow-ups; your own tests and any assistant feedback are separate evidence. Older attempts without stage records show their time as untracked.

## Visual reasoning

Open **Scratchpad** to keep your reasoning beside the Python editor. **Expand scratchpad** gives a diagram the full workspace; return to the split view when you want to code alongside it. Mobile has a dedicated Scratchpad view.

- **Notes** holds plain-text planning, examples, and questions.
- **Trace table** lets you rename variable columns, add/remove columns and rows, duplicate a row, and record state at each step. Tab moves between cells; Enter adds a line within a cell. This is a manual trace, not an automatic Python debugger.
- **Flowchart** supports start/end points, process steps, and decisions. Add shapes, edit labels, and drag them into position. Select a source, choose **Connect**, then select a destination; the editing panel also has a **Connect to** selector. Arrows can carry labels such as Yes and No. Use Fit, zoom, and canvas dragging to navigate.
- With a diagram step focused, arrow keys move it (Shift moves one pixel), Enter opens editing, and Delete removes it with its connections. The outline and labelled coordinate fields provide an alternative to dragging.
- Undo/redo covers scratchpad edits within the current open question; native text undo works inside text fields. **Clear** confirms first and can be undone. Diagram exports are standalone SVGs; **Export** in the scratchpad footer downloads versioned JSON. Project backups include the entire scratchpad.

Each question and interview project has its own scratchpad, saved with the code. Notes and diagrams never execute Python, invalidate tests, or interrupt a run. Submitted attempts retain the scratchpad present at submission; later edits do not rewrite their evidence. Limits: 50,000 note characters, 12 trace columns, 100 rows, 60 diagram nodes, and 120 arrows. A connected MCP assistant can read the structured scratchpad through `get_snapshot`; it cannot silently rewrite your diagram or table.

## Saving and privacy

Click the project name beside **Tracepad** to open the searchable project switcher. Choose **New project** to prepare for another interview, or **Project details** to edit its name, company, role, date, and preparation notes. Each project has independent questions, module files, drafts, input, tests, practice history, timer, and preferences. The same switcher works on desktop and mobile; Escape closes it and returns focus.

Projects save to **`.localpad/projects.sqlite`** on this computer. Workspace and learning changes commit together in a transaction. The database uses schema migrations, foreign keys, WAL journaling, and revision checks. Development and production previews use the same database by default; another browser can open the same saved projects. Clearing browser data does not erase database saves. The `.localpad` directory is ignored by Git and blocked from static serving. Node 24 supplies SQLite directly; no separate database installation is needed.

The Tracepad name does not change existing data or connections. `.localpad/`, `localpad.*` storage keys, `LOCALPAD_*` environment variables, and the `localpad://` / `/api/localpad` protocol names are retained for compatibility. Keep those technical identifiers as documented; no data-folder rename or migration is needed.

Older `localpad.session.v1` and `localpad.learning.v1` browser data is imported into **Imported practice** when first opening projects. Import is idempotent and the original entries remain untouched. Unreadable legacy entries stay preserved with a warning. Full workspace and learning documents are saved; MCP transport truncation never changes this database copy. Existing attempt-history and run-evidence bounds still apply when new practice evidence is recorded. Console output, Python variables, and pending assistant requests remain transient.

Learning history retains at most 30 attempts and the latest 20 recorded runs per attempt; run output and error text in that evidence are shortened to bounded excerpts. Export a project before those limits remove evidence you want to keep. Backups include private code, input, notes, and feedback; they are not redacted shareable question packs.

**Archive** hides a completed project without deleting its work. Open **View archived** in the project switcher to restore it. **Export project** downloads a complete versioned JSON backup, including current in-memory edits; **Import backup** creates a separate project. Use export for a consistent backup while the app is running. To copy SQLite directly, stop the server first; do not copy only the database file while WAL writes are active.

A per-tab browser recovery cache keeps unsaved edits through refresh where browser storage is available. SQLite remains authoritative. A failed database save keeps the editor open, shows **Retry save**, **Save recovery copy**, and **Export work**, and prevents switching away. Concurrent changes in another tab trigger a conflict instead of overwriting either version. A project save is limited to 32 MiB; export work if this limit is reached. Keep the tab open until saving succeeds if browser recovery storage is blocked or full.

Switching projects stops execution and question validation, saves the current workspace, and disconnects its MCP instance. An active interview remains unfinished, and its absolute timer deadline continues while another project is open.

There is no server-side Python execution, shell, package installer, or direct access to your installed Python environment. The runtime supports browser-compatible Python standard-library modules. This is a personal practice environment, not a security boundary for executing hostile third-party code. Each run has a new interpreter. Each test restores submitted project files and resets project imports, globals, and input; standard-library state is shared within a suite. Runtime initialization has a 30-second limit; execution has a 10-second limit per run or entire test suite. Combined output is capped at 100 KiB. Browser memory limits still apply.

## Connect an AI assistant

Open **Practice → AI coach** and copy the generated MCP configuration into your assistant's MCP settings. The configuration uses absolute local paths. Keep Tracepad's server running. The app distinguishes a ready local bridge from recent assistant activity; it does not have a built-in model, store API keys, or claim an assistant is connected before it is used.

Once connected, ask the assistant to use `list_instances` and inspect your instance. **Request AI question** publishes the selected topic and level. The assistant supplies a versioned question package; **Validate & add** executes its reference solution and assertions in the browser before you can start it. Passing these checks establishes consistency with the supplied tests, not a guarantee of question quality. Hints are delivered only after you request one. Reviews cite execution evidence and remain attributed to the assistant.

For a changing interview brief, start a **60-minute mock**, open the **Interview** sidebar, and enable **Allow live interview updates**. A connected assistant can then use `submit_requirement` to append a titled requirement to that active attempt. New requirements show in **Brief** and **Interview**, with their author, time, and an **Acknowledge requirement** action. An unread notice above the editor makes updates visible while you code. Updates never replace your source, original question, or fixed baseline tests. Additional requirements are reviewed by the assistant; original baseline scores do not certify them. Requirements and acknowledgements survive refresh.

The Interview activity feed records received requirements, hints, and execution results. Connection readiness, last assistant activity, and pending requests are shown separately. The app does not run a model or invent a "thinking" status; your external assistant must actually connect and send updates. Disabling live updates or finishing the mock stops new requirement delivery.

The MCP snapshot contains code, input, notes, timer, supplied tests, and bounded attempt evidence. Reference solutions are omitted. Nothing is sent to an external model by the app; when your connected assistant reads the snapshot, its own provider and privacy settings apply. MCP cannot silently replace code or execute Python on the host. The bridge runs on loopback, rejects foreign origins, and authenticates its assistant endpoint using an ignored local token file. See [docs/MCP.md](docs/MCP.md) for tools, schemas, connection details, and examples.

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

Linux CI uses `npx playwright install --with-deps chromium` for browser system dependencies. An installed Google Chrome is not required. `test:e2e:production` builds first, then runs the production checks. The CI matrix runs the same kinds of checks; record completed results in the [alpha checklist](docs/ALPHA_CHECKLIST.md).

Browser tests start their own servers on **127.0.0.1:56173** (development) or **127.0.0.1:54173** (production). Each invocation gets a new database and bridge token under **`.localpad/playwright/<UUID>/`**. Tests refuse to reuse an existing server and fail if their port is occupied. Personal practice servers on 5173/4173 can remain running. Do not supply the old `LOCALPAD_PRODUCTION_URL` override or manually direct tests to a personal server. Test directories and reports are retained locally for inspection and ignored by Git.

Tests cover project isolation, legacy migration, save conflicts, archive/restore, backups, timers, immutable assessment evidence, worker lifecycle, curriculum branches against real Pyodide, and the actual MCP SDK transport. Browser checks exercise code/modules, custom questions, the complete mock, trace tables/flowcharts, refresh recovery, cancellation, limits, AI question validation, hints, and feedback. Algorithm references remain in test-only code; learning references are bundled for offline validation and post-attempt review.

The production offline test uses a fresh browser context and blocks non-local requests while loading Monaco and executing Python. This verifies app operation after installation without internet access; it does not establish a network security boundary for arbitrary user-written Python.

`check:repo` scans publication candidates for prohibited local/generated files, selected credential patterns, and required release metadata. It helps catch common mistakes; it is not a comprehensive secret or legal audit. `notices:check` verifies the generated dependency notice files match the installed lockfile inputs. Follow [the release checklist](docs/ALPHA_CHECKLIST.md) before announcing a prerelease.

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

## License and contributions

Tracepad's original source and original exercise content use the [MIT license](LICENSE). Dependencies and bundled runtime components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md), also shipped with the production build. The project repository is [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad). See [CONTRIBUTING.md](CONTRIBUTING.md) and the [exercise contribution template](docs/EXERCISE_TEMPLATE.md) to propose a change. A repository link does not indicate that a prerelease has been published or its release gates completed.
