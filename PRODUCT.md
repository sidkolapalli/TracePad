# Tracepad

<!-- impeccable:product-schema 1 -->

**Understand it. Build it. Explain it.**

A local coding workspace for learning fundamentals, practicing interviews, and working through problems—with AI guidance when you choose.

Project repository: [sidkolapalli/TracePad](https://github.com/sidkolapalli/TracePad).

## Platform

web

## Stack

Confirmed: React, TypeScript, Vite, Monaco, and browser-contained Python through Pyodide.

## Users and purpose

A single user learning Python fundamentals, practicing coding interviews, or working through problems locally. Success means understanding an approach, writing and executing code, testing solutions, explaining reasoning, and retaining evidence without losing work. Interview rehearsal is one guided flow within that workspace.

## Capabilities and constraints

Eight built-in exercises, blank sandbox, custom questions with assertions and stdin, cancellable execution, an optional session timer, and local autosave backed by SQLite with per-tab browser recovery. Multiple interview projects independently retain code, questions, modules, practice history, timer, and preferences; each supports details, archive/restore, and JSON import/export. Topic drills cover Python OOP, collections, and debugging through honest offline variations; an integrated 60-minute mock starts from blank code. Attempts retain fixed assessment evidence, notes, hints, and self-assessment. An optional standard MCP connection lets an external assistant inspect practice and supply staged questions, requested hints, and attributed feedback. Local-only delivery, no accounts, built-in AI provider, remote execution, shell, or package installer. Runtime assets are served locally after installation.

Each practice workspace supports a fixed `main.py` entry point plus Python modules and packages, with file creation, renaming, deletion, and editor tabs. The sidebar separates Brief, Files, and Interview and can collapse on desktop. Mock interviews can opt in to additional requirements from a connected MCP assistant; updates show their author and time, can be acknowledged, and preserve the original brief and baseline checks. Assistant activity is reported separately from local connection availability.

## Brand commitments

The public product name is Tracepad, with the tagline "Understand it. Build it. Explain it." Existing `.localpad/` data paths, storage keys, and MCP/API identifiers retain their technical names for compatibility; branding changes do not migrate saved work.

The user explicitly requested a familiar CoderPad-style dark IDE with resizable question/editor/output panels and a responsive tabbed layout. Familiar editor affordances and restrained styling take priority over ornamental design.

Light mode preserves the same layout and interaction vocabulary. Motion is brief, communicates state changes, and respects reduced-motion preferences.

## Product principles

Keep code central. Make execution and saving states explicit. Preserve work. Support uninterrupted keyboard use. Keep practice usable without external network access.

The latest design direction removes crowded navigation: one searchable project switcher, a contextual sidebar, Run beside file tabs, collapsible output, and a single five-view mobile navigation row. Project management and optional connection settings remain accessible without taking permanent editor space.

Visual reasoning is first-class: each question owns a saved scratchpad with plain-text notes, editable manual trace tables, and a flowchart canvas. It can sit beside the editor or expand. Structured trace and graph data survives project backups and is inspectable read-only through MCP. The app does not claim automatic Python tracing or freehand illustration.

Mock interviews have explicit self-selected stages: clarify, approach, code/test, follow-up, and wrap-up, followed by submission and review. Pacing windows are guidance; the strict hour and overtime continue independently. The offline equipment-lending mock adds a labelled scripted borrower-view requirement at 40 minutes or on early reveal; live assistant updates replace unrevealed scripted delivery when enabled. Hints require deliberate confirmation in mocks. Debriefs retain phase wall time, help and requirement timestamps, and the submitted scratchpad alongside code and tests. Stage timing includes inactive time and is not inferred attention or speech analysis. Follow-up work is separate from original baseline scoring.
