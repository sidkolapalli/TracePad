export interface TraceTable {
  columns: { id: string; name: string }[];
  rows: { id: string; cells: Record<string, string> }[];
}

export interface FlowNode {
  id: string;
  type: "start" | "process" | "decision" | "end";
  label: string;
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface FlowDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Scratchpad {
  version: 1;
  activeTab: "notes" | "trace" | "flow";
  notes: string;
  trace: TraceTable;
  flow: FlowDiagram;
}

export const SCRATCHPAD_LIMITS = {
  columns: 12,
  rows: 100,
  nodes: 60,
  edges: 120,
  id: 80,
  columnName: 80,
  cell: 2_000,
  nodeLabel: 160,
  edgeLabel: 80,
  notes: 50_000,
  coordinate: 4_000,
} as const;

export function defaultScratchpad(): Scratchpad {
  return {
    version: 1,
    activeTab: "notes",
    notes: "",
    trace: {
      columns: [
        { id: "step", name: "Step" },
        { id: "variables", name: "Variables" },
        { id: "observation", name: "Observation" },
      ],
      rows: ["row1", "row2", "row3"].map((id) => ({ id, cells: {} })),
    },
    flow: { nodes: [], edges: [] },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function id(value: unknown): value is string {
  return (
    text(value, SCRATCHPAD_LIMITS.id) &&
    value.length > 0 &&
    !Object.hasOwn(Object.prototype, value) &&
    value !== "prototype"
  );
}

function unique(values: { id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function coordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= SCRATCHPAD_LIMITS.coordinate
  );
}

/** Validate imported, persisted and transported scratchpads without executing their contents. */
export function isScratchpad(value: unknown): value is Scratchpad {
  if (
    !record(value) ||
    !keys(value, ["version", "activeTab", "notes", "trace", "flow"]) ||
    value.version !== 1 ||
    !["notes", "trace", "flow"].includes(value.activeTab as string) ||
    !text(value.notes, SCRATCHPAD_LIMITS.notes) ||
    !record(value.trace) ||
    !keys(value.trace, ["columns", "rows"]) ||
    !record(value.flow) ||
    !keys(value.flow, ["nodes", "edges"])
  )
    return false;

  const { columns, rows } = value.trace;
  const { nodes, edges } = value.flow;
  if (
    !Array.isArray(columns) ||
    columns.length < 1 ||
    columns.length > SCRATCHPAD_LIMITS.columns ||
    !columns.every(
      (column) =>
        record(column) &&
        keys(column, ["id", "name"]) &&
        id(column.id) &&
        text(column.name, SCRATCHPAD_LIMITS.columnName),
    ) ||
    !unique(columns)
  )
    return false;
  const columnIds = new Set(columns.map((column) => column.id));
  if (
    !Array.isArray(rows) ||
    rows.length > SCRATCHPAD_LIMITS.rows ||
    !rows.every(
      (row) =>
        record(row) &&
        keys(row, ["id", "cells"]) &&
        id(row.id) &&
        record(row.cells) &&
        Object.entries(row.cells).every(
          ([key, cell]) =>
            columnIds.has(key) && text(cell, SCRATCHPAD_LIMITS.cell),
        ),
    ) ||
    !unique(rows)
  )
    return false;
  if (
    !Array.isArray(nodes) ||
    nodes.length > SCRATCHPAD_LIMITS.nodes ||
    !nodes.every(
      (node) =>
        record(node) &&
        keys(node, ["id", "type", "label", "x", "y"]) &&
        id(node.id) &&
        ["start", "process", "decision", "end"].includes(node.type as string) &&
        text(node.label, SCRATCHPAD_LIMITS.nodeLabel) &&
        coordinate(node.x) &&
        coordinate(node.y),
    ) ||
    !unique(nodes)
  )
    return false;
  const nodeIds = new Set(nodes.map((node) => node.id));
  return (
    Array.isArray(edges) &&
    edges.length <= SCRATCHPAD_LIMITS.edges &&
    edges.every(
      (edge) =>
        record(edge) &&
        keys(edge, ["id", "source", "target", "label"]) &&
        id(edge.id) &&
        id(edge.source) &&
        id(edge.target) &&
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        text(edge.label, SCRATCHPAD_LIMITS.edgeLabel),
    ) &&
    unique(edges)
  );
}
