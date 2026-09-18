import { describe, expect, it } from "vitest";
import { scratchpadSchema } from "../../server/contracts";
import { defaultScratchpad, isScratchpad, type Scratchpad } from "./model";

function populated(): Scratchpad {
  const value = defaultScratchpad();
  value.notes = "Check the empty input first.";
  value.trace.rows[0].cells = {
    step: "1",
    variables: "i = 0",
    observation: "No items seen",
  };
  value.flow.nodes = [
    { id: "start", type: "start", label: "Start", x: 20, y: 20 },
    { id: "decision", type: "decision", label: "Empty?", x: 220, y: 160 },
  ];
  value.flow.edges = [
    { id: "edge-1", source: "start", target: "decision", label: "" },
  ];
  return value;
}

describe("scratchpad contract", () => {
  it("creates independent blank scratchpads and preserves literal user text", () => {
    const first = defaultScratchpad(),
      second = defaultScratchpad();
    expect(isScratchpad(first)).toBe(true);
    expect(first.trace.columns.map((column) => column.id)).toEqual([
      "step",
      "variables",
      "observation",
    ]);
    first.trace.rows[0].cells.step = "<script>alert('literal text')</script>";
    expect(second.trace.rows[0].cells).toEqual({});
    expect(scratchpadSchema.parse(first)).toEqual(first);
    expect(scratchpadSchema.parse(populated())).toEqual(populated());
  });

  it.each([
    [
      "unknown fields",
      (value: Scratchpad) => Object.assign(value, { execute: "print('no')" }),
    ],
    [
      "unsupported version",
      (value: Scratchpad) => Object.assign(value, { version: 2 }),
    ],
    [
      "oversized notes",
      (value: Scratchpad) => {
        value.notes = "x".repeat(50_001);
      },
    ],
    [
      "missing columns",
      (value: Scratchpad) => {
        value.trace.columns = [];
      },
    ],
    [
      "duplicate columns",
      (value: Scratchpad) => {
        value.trace.columns.push(value.trace.columns[0]);
      },
    ],
    [
      "duplicate rows",
      (value: Scratchpad) => {
        value.trace.rows.push(value.trace.rows[0]);
      },
    ],
    [
      "unknown cells",
      (value: Scratchpad) => {
        value.trace.rows[0].cells.missing = "unknown";
      },
    ],
    [
      "oversized cells",
      (value: Scratchpad) => {
        value.trace.rows[0].cells.step = "x".repeat(2_001);
      },
    ],
    [
      "unsafe IDs",
      (value: Scratchpad) => {
        value.trace.columns[0].id = "__proto__";
      },
    ],
    [
      "duplicate nodes",
      (value: Scratchpad) => {
        value.flow.nodes.push(value.flow.nodes[0]);
      },
    ],
    [
      "missing endpoints",
      (value: Scratchpad) => {
        value.flow.edges[0].source = "missing";
      },
    ],
    [
      "duplicate edges",
      (value: Scratchpad) => {
        value.flow.edges.push(value.flow.edges[0]);
      },
    ],
    [
      "nonfinite coordinates",
      (value: Scratchpad) => {
        value.flow.nodes[0].x = Infinity;
      },
    ],
    [
      "excess coordinates",
      (value: Scratchpad) => {
        value.flow.nodes[0].y = 4_001;
      },
    ],
    [
      "negative coordinates",
      (value: Scratchpad) => {
        value.flow.nodes[0].x = -1;
      },
    ],
  ])(
    "rejects %s in both persistence and transport contracts",
    (_name, change) => {
      const value = populated();
      change(value);
      expect(isScratchpad(value)).toBe(false);
      expect(scratchpadSchema.safeParse(value).success).toBe(false);
    },
  );

  it("enforces structure counts at their boundaries", () => {
    const value = populated();
    value.trace.columns = Array.from({ length: 12 }, (_, index) => ({
      id: `col-${index}`,
      name: "Variable",
    }));
    value.trace.rows = Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
      cells: {},
    }));
    value.flow.nodes = Array.from({ length: 60 }, (_, index) => ({
      id: `node-${index}`,
      type: "process",
      label: "Step",
      x: index,
      y: index,
    }));
    value.flow.edges = Array.from({ length: 120 }, (_, index) => ({
      id: `edge-${index}`,
      source: "node-0",
      target: "node-1",
      label: "",
    }));
    expect(isScratchpad(value)).toBe(true);
    for (const collection of [
      value.trace.columns,
      value.trace.rows,
      value.flow.nodes,
      value.flow.edges,
    ]) {
      const extra = { ...collection[0], id: "one-too-many" };
      (collection as { id: string }[]).push(extra);
      expect(isScratchpad(value)).toBe(false);
      collection.pop();
    }
  });
});
