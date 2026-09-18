import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "./types";
import { defaultScratchpad } from "./scratchpad/model";
import {
  STORAGE_KEY,
  defaultSession,
  formatTime,
  getDraft,
  loadSession,
  pauseTimer,
  resetTimer,
  saveSession,
  startTimer,
  timerRemaining,
} from "./session";

const example: Exercise = {
  id: "example",
  title: "Example",
  difficulty: "Easy",
  topic: "Arrays",
  description: "Return a value.",
  examples: [],
  constraints: [],
  starterCode: "def solve():\n    pass\n",
  tests: [{ id: "basic", name: "Basic", code: "assert solve() == 1" }],
};

let entries: Map<string, string>;
beforeEach(() => {
  entries = new Map();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("session persistence", () => {
  it("round-trips per-question scratchpads and returns independently editable draft copies", () => {
    const state = defaultSession();
    const scratchpad = defaultScratchpad();
    scratchpad.activeTab = "trace";
    scratchpad.notes = "Plan before coding.";
    scratchpad.trace.rows[0].cells.variables = "left = 0";
    state.drafts.example = {
      source: "print('saved')",
      stdin: "",
      tests: [],
      scratchpad,
    };
    state.drafts.other = {
      source: "",
      stdin: "",
      tests: [],
      scratchpad: defaultScratchpad(),
    };
    state.sidebarTab = "scratchpad";
    expect(saveSession(state)).toBeNull();
    expect(loadSession()).toEqual({ state });
    const copy = getDraft(state, example);
    copy.scratchpad!.notes = "Changed";
    copy.scratchpad!.trace.rows[0].cells.variables = "left = 2";
    expect(state.drafts.example.scratchpad).toEqual(scratchpad);
    expect(state.drafts.other.scratchpad?.notes).toBe("");
    const broken = structuredClone(state);
    broken.drafts.example.scratchpad!.flow.edges.push({
      id: "edge",
      source: "missing",
      target: "missing",
      label: "",
    });
    const raw = JSON.stringify(broken);
    entries.set(STORAGE_KEY, raw);
    expect(loadSession().warning).toContain("could not be read");
    expect(entries.get(STORAGE_KEY)).toBe(raw);
  });

  it("round-trips module files, active file, and sidebar preferences", () => {
    const state = defaultSession();
    state.drafts.example = {
      source: "import helpers",
      stdin: "",
      tests: [],
      files: { "helpers.py": "answer = 42", "pkg/__init__.py": "" },
      activeFile: "helpers.py",
    };
    state.sidebarTab = "files";
    state.sidebarCollapsed = true;
    expect(saveSession(state)).toBeNull();
    expect(loadSession()).toEqual({ state });
    const copy = getDraft(state, example);
    copy.files!["helpers.py"] = "changed";
    expect(state.drafts.example.files!["helpers.py"]).toBe("answer = 42");
  });

  it("recovers missing file selection and malformed sidebar preferences without losing code", () => {
    const state = defaultSession();
    state.drafts.example = {
      source: "saved main",
      stdin: "",
      tests: [],
      files: { "helpers.py": "saved helper" },
      activeFile: "deleted.py",
    };
    entries.set(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        sidebarTab: "unknown",
        sidebarCollapsed: "yes",
      }),
    );
    const loaded = loadSession();
    expect(loaded.warning).toBeUndefined();
    expect(loaded.state.drafts.example).toEqual({
      ...state.drafts.example,
      activeFile: "main.py",
    });
    expect(loaded.state.sidebarTab).toBe("brief");
    expect(loaded.state.sidebarCollapsed).toBe(false);
  });

  it("preserves legacy main-only drafts and rejects invalid module maps without overwriting storage", () => {
    const state = defaultSession();
    state.drafts.example = {
      source: "x".repeat(1024 * 1024 + 1),
      stdin: "",
      tests: [],
    };
    entries.set(STORAGE_KEY, JSON.stringify(state));
    expect(loadSession().state.drafts.example.source).toBe(
      state.drafts.example.source,
    );
    state.drafts.example.files = { "helper.py": "valid code" };
    entries.set(STORAGE_KEY, JSON.stringify(state));
    expect(loadSession().state.drafts.example).toEqual(state.drafts.example);
    state.drafts.example.source = "import helper";
    state.drafts.example.files = { "helper.py": "#".repeat(1024 * 1024 + 1) };
    entries.set(STORAGE_KEY, JSON.stringify(state));
    expect(loadSession().state.drafts.example).toEqual(state.drafts.example);
    for (const files of [
      { "../escape.py": "" },
      { "main.py": "shadow" },
      { "helper.py": 42 },
    ]) {
      const raw = JSON.stringify({
        ...state,
        drafts: { example: { source: "saved", stdin: "", tests: [], files } },
      });
      entries.set(STORAGE_KEY, raw);
      expect(loadSession().warning).toBeTruthy();
      expect(entries.get(STORAGE_KEY)).toBe(raw);
    }
  });

  it("opens a fresh manually started 45-minute session when no data is saved", () => {
    expect(loadSession()).toEqual({ state: defaultSession() });
    expect(defaultSession()).toMatchObject({
      activeId: "pair-sum",
      timer: { started: false, deadline: null, remainingMs: 2_700_000 },
    });
  });

  it("round-trips drafts, custom questions, preferences and a running deadline", () => {
    const state = defaultSession();
    state.customExercises = [
      { ...example, id: "custom-1", difficulty: "Custom", custom: true },
    ];
    state.activeId = "custom-1";
    state.drafts["custom-1"] = {
      source: 'print("saved")',
      stdin: "one\ntwo",
      tests: [{ id: "test", name: "Example", code: "assert True" }],
    };
    state.timer = startTimer(state.timer, 10_000);
    state.fontSize = 18;
    state.theme = "light";
    expect(saveSession(state)).toBeNull();
    expect(loadSession()).toEqual({ state });
    expect(timerRemaining(loadSession().state.timer, 70_000)).toBe(2_640_000);
  });

  it("clamps valid numeric preferences to their supported ranges", () => {
    entries.set(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSession(),
        fontSize: 80,
        panelWidth: 2,
        consoleHeight: 900,
      }),
    );
    expect(loadSession().state).toMatchObject({
      fontSize: 24,
      panelWidth: 25,
      consoleHeight: 500,
    });
    entries.set(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSession(),
        fontSize: 2,
        panelWidth: 98,
        consoleHeight: 1,
      }),
    );
    expect(loadSession().state).toMatchObject({
      fontSize: 12,
      panelWidth: 55,
      consoleHeight: 160,
    });
  });

  it.each([undefined, "unknown-theme"])(
    "preserves old saved work when theme is %s",
    (theme) => {
      const state = defaultSession();
      state.drafts["pair-sum"] = {
        source: 'print("keep my draft")',
        stdin: "",
        tests: [],
      };
      entries.set(STORAGE_KEY, JSON.stringify({ ...state, theme }));
      const loaded = loadSession();
      expect(loaded.warning).toBeUndefined();
      expect(loaded.state).toEqual(state);
    },
  );

  it.each([
    "not JSON",
    "null",
    "[]",
    "{}",
    JSON.stringify({ ...defaultSession(), version: 2 }),
    JSON.stringify({ ...defaultSession(), fontSize: "14" }),
    JSON.stringify({
      ...defaultSession(),
      drafts: { question: { source: 123, stdin: "", tests: [] } },
    }),
    JSON.stringify({
      ...defaultSession(),
      drafts: { question: { source: "", stdin: "", tests: [null] } },
    }),
    JSON.stringify({
      ...defaultSession(),
      customExercises: [
        {
          ...example,
          custom: true,
          difficulty: "Custom",
          examples: [{ input: [] }],
        },
      ],
    }),
    JSON.stringify({
      ...defaultSession(),
      timer: { ...defaultSession().timer, deadline: 100, started: false },
    }),
    JSON.stringify({
      ...defaultSession(),
      timer: { ...defaultSession().timer, durationMs: 0 },
    }),
  ])(
    "recovers malformed data without replacing the original entry: %s",
    (raw) => {
      entries.set(STORAGE_KEY, raw);
      const result = loadSession();
      expect(result.state).toEqual(defaultSession());
      expect(result.warning).toBeTruthy();
      expect(entries.get(STORAGE_KEY)).toBe(raw);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate test and custom question IDs", () => {
    const custom = { ...example, custom: true, difficulty: "Custom" };
    entries.set(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSession(),
        customExercises: [custom, custom],
      }),
    );
    expect(loadSession().warning).toBeTruthy();
    entries.set(
      STORAGE_KEY,
      JSON.stringify({
        ...defaultSession(),
        drafts: {
          example: {
            source: "",
            stdin: "",
            tests: [example.tests[0], example.tests[0]],
          },
        },
      }),
    );
    expect(loadSession().warning).toBeTruthy();
  });

  it("reports inaccessible storage and keeps unsaved work in memory", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(loadSession().warning).toBeTruthy();
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const state = defaultSession();
    state.drafts.example = {
      source: "valuable code",
      stdin: "input",
      tests: [],
    };
    const snapshot = JSON.stringify(state);
    expect(saveSession(state)).toContain("Your work is still here");
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("draft isolation", () => {
  it("creates independent fresh defaults and draft test arrays", () => {
    const state = defaultSession();
    const first = getDraft(state, example);
    first.source = "changed";
    first.tests[0].code = "changed test";
    first.tests.push({ id: "extra", name: "Extra", code: "assert True" });
    expect(getDraft(state, example)).toEqual({
      source: example.starterCode,
      stdin: "",
      tests: example.tests,
    });
    expect(defaultSession().drafts).toEqual({});
  });

  it("uses each exercise’s own draft and copies saved tests", () => {
    const state = defaultSession();
    state.drafts.example = {
      source: "",
      stdin: "saved",
      tests: [{ id: "saved", name: "Saved", code: "assert False" }],
    };
    const draft = getDraft(state, example);
    expect(draft.source).toBe("");
    expect(draft.stdin).toBe("saved");
    draft.tests[0].code = "changed";
    expect(state.drafts.example.tests[0].code).toBe("assert False");
    expect(getDraft(state, { ...example, id: "other" }).source).toBe(
      example.starterCode,
    );
  });

  it("does not interpret inherited object properties as saved drafts", () => {
    expect(
      getDraft(defaultSession(), { ...example, id: "toString" }).source,
    ).toBe(example.starterCode);
  });
});

describe("interview timer", () => {
  it("uses wall-clock deadlines across delays and does not restart a running timer", () => {
    const original = defaultSession().timer;
    const running = startTimer(original, 1_000);
    expect(running.deadline).toBe(2_701_000);
    expect(timerRemaining(running, 121_000)).toBe(2_580_000);
    expect(startTimer(running, 121_000)).toEqual(running);
    expect(original.started).toBe(false);
  });

  it("preserves the remaining time when paused and resumes from that amount", () => {
    const paused = pauseTimer(
      startTimer(defaultSession().timer, 1_000),
      61_000,
    );
    expect(paused).toMatchObject({
      remainingMs: 2_640_000,
      deadline: null,
      started: true,
    });
    expect(timerRemaining(paused, 9_999_999)).toBe(2_640_000);
    expect(startTimer(paused, 900_000).deadline).toBe(3_540_000);
  });

  it("keeps negative overtime and can pause and resume it", () => {
    const running = startTimer(
      resetTimer(defaultSession().timer, 60_000),
      1_000,
    );
    expect(timerRemaining(running, 66_000)).toBe(-5_000);
    const paused = pauseTimer(running, 66_000);
    expect(paused.remainingMs).toBe(-5_000);
    expect(timerRemaining(startTimer(paused, 100_000), 101_000)).toBe(-6_000);
  });

  it("resets to the selected duration and clears the start state", () => {
    const running = startTimer(defaultSession().timer, 1_000);
    expect(resetTimer(running)).toEqual(defaultSession().timer);
    expect(resetTimer(running, 30 * 60_000)).toEqual({
      durationMs: 1_800_000,
      remainingMs: 1_800_000,
      deadline: null,
      started: false,
    });
    expect(resetTimer(running, -1)).toEqual(defaultSession().timer);
  });

  it.each([
    [0, "00:00"],
    [45 * 60_000, "45:00"],
    [59_001, "01:00"],
    [3_600_000, "01:00:00"],
    [-5_000, "+00:05"],
  ])("formats %s milliseconds as %s", (milliseconds, expected) => {
    expect(formatTime(milliseconds as number)).toBe(expected);
  });
});
