---
name: Tracepad
summary: A local coding workspace for learning, interview practice, and visual reasoning.
colors:
  light-ground: "#eef1f5"
  dark-ground: "#12151b"
  light-panel: "#f8fafc"
  dark-panel: "#1c212a"
  light-canvas: "#ffffff"
  dark-canvas: "#171b22"
  light-ink: "#202d3f"
  dark-ink: "#e6ebf2"
  light-muted: "#566579"
  dark-muted: "#a3afc1"
  light-accent: "#255bca"
  dark-accent: "#a6bfff"
  light-selection: "#eaf0fe"
  dark-selection: "#2b364d"
  light-border: "#d7dfe8"
  dark-border: "#303844"
  light-inset: "#edf1f6"
  dark-inset: "#272e39"
  dark-action: "#b0c7ff"
  dark-action-ink: "#172a50"
  light-action-hover: "#1e4dab"
  dark-action-hover: "#c8d7ff"
  light-error: "#a32e2b"
  dark-error: "#f2a29d"
typography:
  interface:
    {
      fontFamily: "Segoe UI, -apple-system, BlinkMacSystemFont, Arial, sans-serif",
      fontSize: "14px",
    }
  question: { fontSize: "27px", fontWeight: 600, lineHeight: 1.28 }
  prose: { fontSize: "15px", lineHeight: 1.8 }
  wide-prose: { fontSize: "16px" }
  compact-heading: { fontSize: "24px" }
  panel-heading: { fontSize: "20px" }
  brand-small: { fontSize: "18px" }
  menu-heading: { fontSize: "17px" }
  control: { fontSize: "13px" }
  compact-control: { fontSize: "12px" }
  metadata: { fontSize: "11px" }
  auxiliary: { fontSize: "10px" }
rounded:
  field: "4px"
  control: "6px"
  menu: "8px"
  workspace: "9px"
  project-picker: "10px"
  dialog: "12px"
---

# Tracepad design system

The public name is **Tracepad**. The tagline is **Understand it. Build it. Explain it.** The descriptor is: "A local coding workspace for learning fundamentals, practicing interviews, and working through problems—with AI guidance when you choose." Use the short name in working chrome; the tagline and descriptor belong in introductory or explanatory contexts where they do not crowd the editor.

The user rejected the crowded, layered navigation. The replacement is an operating tool: a quiet header above a familiar split question/editor workspace. It prioritizes space to reason and write code. It is not a marketing page. System interface fonts are deliberate for a local, offline IDE; Consolas and compatible monospace fallbacks are reserved for source, output, filenames, timer values, and shortcuts.

## Navigation and hierarchy

The original Tracepad mark is a T-shaped trace: a filled starting point connects to an open endpoint. Use the current accent color, with a 28px mark in the desktop header and 24px on mobile. The same geometry appears in the browser icon, loading state, and practice heading. The tagline belongs below the practice heading and in the loading state; working chrome keeps only the mark and name. The reusable SVG lives in `src/TracepadMark.tsx`, with a standalone asset in `public/brand/tracepad-mark.svg`.

There is one project switcher beside the wordmark. It opens a searchable native popover with current selection, company/role context, keyboard navigation, explicit Project details, New project, Archive, and backup actions. The project name never silently edits details. Escape and outside click dismiss the picker. Projects do not occupy a permanent rail.

The desktop sidebar has Brief, Files, Scratchpad, and Interview tabs. Question selection and New question appear only in Brief. Files owns module creation and management. Interview owns approach notes, hints, requirements, and review actions; activity and connection details are disclosures. Unread requirements remain visible above the editor and in the brief. Actual assistant activity is separate from local bridge availability.

Run and Run tests sit beside file tabs. Font size, Reset code, and Focus editor live in Editor options. The console can collapse to its tab bar; executing code or selecting an output tab expands it. Saving is communicated once in the footer; failures expose recovery actions.

The console is a flat monospace output surface with a compact main.py/Python context bar and Copy/Clear actions. Keep real run status in the output tab bar, preserve whitespace, distinguish stderr by the theme's error color, and scroll locally. New output follows the bottom unless the user has scrolled up. Clear affects display only, preserving saved assessment evidence. A quiet footer links to pre-supplied Input; do not imply an interactive shell with a fake prompt or cursor. Console styling lives in src/console.css.

## Layout

The shell uses 100dvh with a 68px desktop header and 32px footer. The workspace is inset 14px with a thin border and 9px corners. Sidebar and editor tab bars align at 47px. Question content has 28px horizontal padding, 15px prose at 1.8 line height, and 27px titles. Inset examples are code containers, not generic cards. The initial split is 35% question / 65% editor, adjustable from 25% to 55%; output starts at 260px and can resize or collapse. The desktop sidebar can collapse to its existing icon rail.

At 700px and below, the header is two compact rows totaling 102px. One 44px navigation row shows Brief, Files, Code, Scratchpad, and Interview. There are no nested sidebar tabs. Each view uses the full width. Run remains beside file tabs, with horizontally scrolling filenames. Core execution, timer, console, and Explorer actions have real 44px touch targets without overlapping hit areas; desktop retains compact controls. Mobile output is capped at 42% of its pane. At widths above 1600px, prose grows to 16px and horizontal question padding to 36px.

## Surfaces and interaction

Cool neutral surfaces separate the chrome, reading pane, and code canvas. The full palette switches with color-scheme; Monaco uses separately authored light and dark syntax colors. Blue marks actions, selections, and focus. Success, warning, and failure retain semantic colors plus text. Theme changes preserve editor models and undo history.

Working panes are flat with dividing lines. Transient project, library, and editor-settings menus use soft offset shadows. Dialogs protect form focus. Controls use small radii; full dialogs use 12px. No gradients, decorative illustration, fake texture, or promotional badges.

Motion is limited to short menu reveals and state transitions; reduced-motion preferences remove them. Keyboard focus is visible. Tabs support arrows, Home, and End; separators support arrow resizing. Editor options and project navigation return focus on Escape. Long user content wraps in reading panes while code scrolls deliberately.

## Implementation

The shared primitives live in src/styles.css and src/workspace.css; src/studio.css defines the replacement shell, theme roles, navigation, and responsive overrides. Monaco themes remain in src/CodeEditor.tsx. The current direction contract is embedded in index.html. Preserve action semantics, real execution and save states, and responsive focus behavior when changing visuals.

Practice setup has a fixed action footer outside the scrolling configuration. Start stays visible at laptop and phone heights, with timer-start reassurance beside it. The secondary AI request includes its external-assistant prerequisite, actual activity status, and a connection-settings path. Preparation, cancellation, and failure feedback remain beside these actions. These scoped rules live in src/learning/practice-setup.css; src/touch.css provides the final mobile hit-area rules.

An empty test suite offers Add tests beside Run, leading directly to the Tests pane. Deletion offers inline Undo and restores assertions in their original order, including their names. This recovery remains available across output-tab changes within the current question; switching questions clears it. Run's tooltip and accessible shortcut describe Ctrl/Cmd+Enter. Overtime guidance names the actions allowed by the current practice mode.

## Scratchpad

The Scratchpad sidebar owns Notes, Trace table, and Flowchart. It shares the sidebar/editor split and can expand across the working area; this is an inline workspace, not a modal. On mobile it gets one of five top-level views. The current tool owns its contextual controls; there is no extra global toolbar.

Trace tables use a sticky editable header, monospace cell contents, row numbers, and explicit duplicate/delete actions. A scrollable region contains wide tables without widening the page. Flowcharts use real SVG start/end capsules, process rectangles, decision diamonds, and labelled directed curves on a dotted coordinate canvas. Canvas dots communicate position in an actual drawing tool. Selection uses the studio accent; labels use the studio ink. Node details and accessible outline live in a collapsible inspector.

Nodes drag locally and save on release. Whole-scratchpad undo/redo stays near the tool tabs. Notes are a plain writing area. A quiet footer identifies per-question storage and provides export/clear actions. Scratchpad changes preserve Python execution state and the timer. Keyboard paths cover diagram movement, editing, connection selectors, and row/cell editing.

## File Explorer

Files follows the familiar VS Code Explorer pattern: a compact Explorer heading, icon actions, a collapsible question root, and flat rows with folders sorted before files. Indent guides and chevrons show hierarchy. Selected files use a full-width selection surface; Python icons and a thin active-tab top rule share the existing accent. Folder icons stay neutral.

Create and rename happen inline at the relevant tree position. New file uses the focused folder as its starting path. Row actions appear on hover, selection, or keyboard focus and remain visible on touch layouts. The fixed main.py entry point cannot be renamed or deleted. File tabs show basenames, adding a parent path when names collide; accessible names and tooltips retain the full path. Arrow navigation, F2, Delete, Enter, and Escape retain their usual tree and editing meanings.

## Mock interview journey

The Interview pane owns the mock's current stage. Compact numbered stage buttons communicate the actual sequence; selection records a transition, while a separate pacing sentence reflects elapsed wall time. A single current-stage area holds its prompt and relevant notes or tool links. Approach notes and assistance use disclosures to keep the working area clear. Follow-up requirements remain attributed and acknowledgeable within the same pane and the Brief, with the existing unread notice while coding.

Mock hints and submission use inline checkpoints. No new global navigation or overlay is needed. The review uses an accessible phase-time table and progressive disclosures for assistance, requirement changes, timeline, and the submitted scratchpad. The content distinguishes observed execution, user-marked stages, manual reasoning, and assistant feedback. Existing cool surfaces, typography, focus states, and narrow layouts apply.
